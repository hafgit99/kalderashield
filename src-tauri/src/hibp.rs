// Have I Been Pwned (HIBP) v3 k-anonymity range lookup via Rust.
//
// Moving the outbound range lookup from the WebView into Rust lets the Tauri
// CSP (`src-tauri/tauri.conf.json`) drop `https://api.pwnedpasswords.com` from
// `connect-src` altogether, leaving the desktop and Android WebViews with zero
// external internet connectivity.
//
// Security invariants enforced here:
//   - Only an exact 5-character ASCII hex SHA-1 prefix is accepted (never a
//     full hash, never a query string, never a path traversal segment).
//   - Redirects are completely disabled (`Policy::none()`): the HIBP range
//     endpoint never redirects legitimately, so refusing redirects prevents a
//     MITM or compromised DNS response from steering requests elsewhere.
//   - `Add-Padding: true` is always sent so response byte-lengths cannot be
//     fingerprinted by passive network observers.
//   - TLS uses `rustls` with bundled Mozilla roots (`webpki-roots`), matching
//     `android_update.rs` so Windows, macOS, Linux, and Android behave
//     identically with zero cookies or WebView proxy/cache state.
//   - Response size is strictly capped at `MAX_RANGE_BYTES` (512 KiB).

use std::sync::Arc;
use std::time::Duration;

const HIBP_RANGE_BASE_URL: &str = "https://api.pwnedpasswords.com/range/";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
/// A padded HIBP k-anonymity range response is ~35–55 KiB (~800–1000 lines).
/// Anything above 512 KiB is malformed or hostile.
const MAX_RANGE_BYTES: usize = 512 * 1024;

/// Validates and normalizes a 5-character hexadecimal SHA-1 hash prefix.
fn normalize_prefix(prefix: &str) -> Result<String, String> {
    if prefix.len() != 5 || !prefix.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("HIBP prefix must be exactly 5 hexadecimal characters.".to_string());
    }
    Ok(prefix.to_ascii_uppercase())
}

fn build_range_url(prefix: &str) -> Result<String, String> {
    let normalized = normalize_prefix(prefix)?;
    Ok(format!("{HIBP_RANGE_BASE_URL}{normalized}"))
}

fn tls_config() -> Result<rustls::ClientConfig, String> {
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    Ok(rustls::ClientConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .map_err(|error| format!("failed to build HIBP TLS configuration: {error}"))?
    .with_root_certificates(roots)
    .with_no_client_auth())
}

/// Fetches the padded HIBP k-anonymity suffix list for a 5-hex SHA-1 prefix.
#[tauri::command]
pub async fn fetch_hibp_range(prefix: String) -> Result<String, String> {
    let url = build_range_url(&prefix)?;

    let client = reqwest::Client::builder()
        .user_agent(concat!("KalderaShield/", env!("CARGO_PKG_VERSION")))
        .timeout(REQUEST_TIMEOUT)
        .redirect(reqwest::redirect::Policy::none())
        .use_preconfigured_tls(tls_config()?)
        .build()
        .map_err(|error| format!("failed to build HIBP HTTP client: {error}"))?;

    let response = client
        .get(&url)
        .header("Add-Padding", "true")
        .header("Cache-Control", "no-store")
        .send()
        .await
        .map_err(|error| format!("HIBP range request failed: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "HIBP range request failed with HTTP {}.",
            status.as_u16()
        ));
    }

    if response
        .content_length()
        .is_some_and(|length| length > MAX_RANGE_BYTES as u64)
    {
        return Err("HIBP range response exceeded maximum allowed size.".to_string());
    }

    let body = response
        .bytes()
        .await
        .map_err(|error| format!("failed to read HIBP range response: {error}"))?;

    if body.len() > MAX_RANGE_BYTES {
        return Err("HIBP range response exceeded maximum allowed size.".to_string());
    }

    String::from_utf8(body.into())
        .map_err(|_| "HIBP range response is not valid UTF-8.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_valid_five_char_hex_prefixes() {
        assert_eq!(normalize_prefix("5baa6").unwrap(), "5BAA6");
        assert_eq!(normalize_prefix("0F9aB").unwrap(), "0F9AB");
        assert_eq!(
            build_range_url("5baa6").unwrap(),
            "https://api.pwnedpasswords.com/range/5BAA6"
        );
    }

    #[test]
    fn rejects_invalid_or_overlong_prefixes() {
        for bad in [
            "",
            "5BAA",
            "5BAA61",
            " 5BAA6",
            "5BAA6 ",
            "5BAA6?mode=ntlm",
            "../ab",
            "ZZZZZ",
            "5BAA6/extra",
            "5BAA6\n",
            "5BA\n6",
            "5BAA6\x00",
        ] {
            assert!(
                normalize_prefix(bad).is_err(),
                "expected invalid prefix to be rejected: {bad:?}"
            );
        }
    }

    #[test]
    fn builds_hibp_tls_config() {
        assert!(tls_config().is_ok());
    }
}
