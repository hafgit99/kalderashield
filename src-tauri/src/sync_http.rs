// Hardened Rust HTTP transport for E2EE Cloud Sync (WebDAV & S3-compatible stores).
//
// Routing WebDAV/S3 sync traffic through Rust allows the Tauri WebView CSP
// (`src-tauri/tauri.conf.json`) to keep `connect-src 'self' ipc: http://ipc.localhost`
// (zero external internet access from WebView JS) while enabling real WebDAV,
// Nextcloud, Synology NAS, AWS S3, MinIO, and Cloudflare R2 sync on Desktop
// and Android without CORS breakage.
//
// Security invariants:
//   - Only explicit sync HTTP methods are permitted (GET, PUT, HEAD, MKCOL, PROPFIND).
//   - Remote URLs MUST use HTTPS; HTTP is strictly restricted to loopback
//     (localhost, 127.0.0.0/8, ::1) and RFC 1918 private LAN addresses.
//   - Redirects are disabled (`Policy::none()`) to prevent open-redirect SSRF
//     and Authorization header leakage.
//   - Request and response bodies are strictly capped at 32 MiB.
//   - Uses pinned rustls + webpki-roots with a 30-second timeout.

use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::Duration;

const SYNC_HTTP_TIMEOUT: Duration = Duration::from_secs(30);
pub const MAX_SYNC_HTTP_BODY_BYTES: usize = 32 * 1024 * 1024; // 32 MiB

#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SyncHttpRequest {
    pub url: String,
    pub method: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub max_response_bytes: Option<usize>,
}

#[derive(serde::Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncHttpResponse {
    pub status: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub etag: Option<String>,
    pub body: String,
}

fn is_private_or_loopback_host(host: &str) -> bool {
    let trimmed = host.trim().trim_matches(|c| c == '[' || c == ']');
    if trimmed.eq_ignore_ascii_case("localhost") {
        return true;
    }

    if let Ok(ip) = trimmed.parse::<IpAddr>() {
        return match ip {
            IpAddr::V4(v4) => {
                v4.is_loopback() || v4.is_private()
            }
            IpAddr::V6(v6) => {
                if v6.is_loopback() {
                    return true;
                }
                if let Some(mapped) = v6.to_ipv4_mapped() {
                    return mapped.is_loopback() || mapped.is_private();
                }
                false
            }
        };
    }

    false
}

fn validate_sync_url(raw_url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(raw_url.trim())
        .map_err(|_| "Sync URL is invalid.".to_string())?;

    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Sync URL must not embed credentials in the URL.".to_string());
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "Sync URL must contain a valid hostname.".to_string())?;

    match parsed.scheme() {
        "https" => Ok(parsed),
        "http" if is_private_or_loopback_host(host) => Ok(parsed),
        "http" => Err(
            "Sync URL must use HTTPS for security. Loopback and RFC 1918 local network addresses are exempt."
                .to_string(),
        ),
        _ => Err("Sync URL must use the HTTPS (or local LAN HTTP) protocol.".to_string()),
    }
}

fn parse_allowed_method(method: &str) -> Result<reqwest::Method, String> {
    let upper = method.trim().to_ascii_uppercase();
    match upper.as_str() {
        "GET" => Ok(reqwest::Method::GET),
        "PUT" => Ok(reqwest::Method::PUT),
        "HEAD" => Ok(reqwest::Method::HEAD),
        "MKCOL" | "PROPFIND" => reqwest::Method::from_bytes(upper.as_bytes())
            .map_err(|_| format!("Unsupported sync HTTP method: {upper}")),
        _ => Err(format!("Disallowed sync HTTP method: {upper}")),
    }
}

fn is_allowed_header_name(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "authorization"
            | "content-type"
            | "depth"
            | "if-match"
            | "host"
            | "x-amz-date"
            | "x-amz-content-sha256"
            | "x-amz-security-token"
    )
}

fn tls_config() -> Result<rustls::ClientConfig, String> {
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    Ok(rustls::ClientConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .map_err(|error| format!("failed to build sync TLS configuration: {error}"))?
    .with_root_certificates(roots)
    .with_no_client_auth())
}

#[tauri::command]
pub async fn sync_http_request(request: SyncHttpRequest) -> Result<SyncHttpResponse, String> {
    let url = validate_sync_url(&request.url)?;
    let method = parse_allowed_method(&request.method)?;

    if let Some(ref body) = request.body {
        if body.len() > MAX_SYNC_HTTP_BODY_BYTES {
            return Err("Sync upload body exceeded maximum allowed size (32 MiB).".to_string());
        }
    }

    let response_limit = request
        .max_response_bytes
        .unwrap_or(MAX_SYNC_HTTP_BODY_BYTES)
        .min(MAX_SYNC_HTTP_BODY_BYTES);

    let client = reqwest::Client::builder()
        .user_agent(concat!("KalderaShield/", env!("CARGO_PKG_VERSION")))
        .timeout(SYNC_HTTP_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .use_preconfigured_tls(tls_config()?)
        .build()
        .map_err(|error| format!("failed to build sync HTTP client: {error}"))?;

    let mut req_builder = client.request(method, url);
    for (name, value) in &request.headers {
        if !is_allowed_header_name(name) {
            return Err(format!("Disallowed sync request header: {name}"));
        }
        // Let reqwest derive the Host header from the validated URL so SigV4 Host
        // matches the actual socket target cleanly.
        if name.eq_ignore_ascii_case("host") {
            continue;
        }
        if value.contains('\r') || value.contains('\n') {
            return Err(format!("Invalid characters in header value: {name}"));
        }
        req_builder = req_builder.header(name.as_str(), value.as_str());
    }

    if let Some(body) = request.body {
        req_builder = req_builder.body(body);
    }

    let mut response = req_builder
        .send()
        .await
        .map_err(|error| format!("Sync HTTP request failed: {error}"))?;

    let status = response.status().as_u16();
    let etag = response
        .headers()
        .get(reqwest::header::ETAG)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    if response
        .content_length()
        .is_some_and(|len| len > response_limit as u64)
    {
        return Err(format!(
            "Remote sync response exceeded maximum allowed size ({response_limit} bytes)."
        ));
    }

    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("Failed reading sync HTTP response: {error}"))?
    {
        if bytes.len().saturating_add(chunk.len()) > response_limit {
            return Err(format!(
                "Remote sync response exceeded maximum allowed size ({response_limit} bytes)."
            ));
        }
        bytes.extend_from_slice(&chunk);
    }

    let body = String::from_utf8(bytes)
        .map_err(|_| "Remote sync response is not valid UTF-8.".to_string())?;

    Ok(SyncHttpResponse { status, etag, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_https_and_private_lan_http_urls() {
        assert!(validate_sync_url("https://nextcloud.example.com/remote.php/dav/files/alice/").is_ok());
        assert!(validate_sync_url("http://localhost:9000/bucket/vault.ks").is_ok());
        assert!(validate_sync_url("http://127.0.0.1:8080/dav").is_ok());
        assert!(validate_sync_url("http://192.168.1.50:5005/KalderaShield/vault.ks").is_ok());
        assert!(validate_sync_url("http://10.0.0.5/dav").is_ok());
        assert!(validate_sync_url("http://172.16.0.10/dav").is_ok());
    }

    #[test]
    fn rejects_plaintext_public_http_and_embedded_credentials() {
        assert!(validate_sync_url("http://nextcloud.example.com/dav").is_err());
        assert!(validate_sync_url("http://8.8.8.8/dav").is_err());
        assert!(validate_sync_url("http://172.32.0.1/dav").is_err());
        assert!(validate_sync_url("https://user:pass@nextcloud.example.com/dav").is_err());
        assert!(validate_sync_url("file:///etc/passwd").is_err());
    }

    #[test]
    fn enforces_method_and_header_allowlists() {
        for m in ["GET", "PUT", "HEAD", "MKCOL", "PROPFIND", "get"] {
            assert!(parse_allowed_method(m).is_ok(), "method {m} should be allowed");
        }
        for m in ["POST", "DELETE", "PATCH", "CONNECT", "TRACE"] {
            assert!(parse_allowed_method(m).is_err(), "method {m} must be rejected");
        }

        assert!(is_allowed_header_name("Authorization"));
        assert!(is_allowed_header_name("If-Match"));
        assert!(is_allowed_header_name("x-amz-content-sha256"));
        assert!(is_allowed_header_name("Depth"));
        assert!(!is_allowed_header_name("Cookie"));
        assert!(!is_allowed_header_name("X-Forwarded-For"));
    }

    #[test]
    fn builds_sync_tls_config() {
        assert!(tls_config().is_ok());
    }
}
