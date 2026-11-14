// Android update channel -- the manifest fetch.
//
// The webview cannot read `android-latest.json` itself. `github.com` answers the
// request with a redirect to `release-assets.githubusercontent.com`, and that
// host sends no `Access-Control-Allow-Origin` header, so the browser discards
// the response and `fetch` rejects with "Failed to fetch" -- before the CSP is
// consulted at all. Widening the CSP would not have helped; the download host
// is not negotiable.
//
// So the fetch happens here, next to the desktop updater that already talks to
// the same release, and the page receives the bytes through `invoke`. Two
// consequences are worth stating:
//
//   - the webview keeps no network access to GitHub at all, which is why the
//     `connect-src` allowance that used to be there is gone;
//   - the request is not subject to CORS, so the redirect to the asset host can
//     be followed -- but only to hosts that belong to the release
//     infrastructure (see `is_release_host`).
//
// TLS trusts the Mozilla root program compiled into the binary rather than the
// platform verifier. On Android, `rustls-platform-verifier` needs a Kotlin
// component and an explicit JNI hand-off that this app does not have; using it
// would have failed certificate verification at runtime and produced the same
// dead channel by another route.

use std::sync::Arc;
use std::time::Duration;

/// Where the release publishes the Android update manifest.
///
/// `releases/latest/download/<name>` resolves to the newest non-prerelease
/// release, which is the same release the desktop updater is offered by. The
/// file name is version-less on purpose: the URL has to stay stable.
const MANIFEST_URL: &str =
    "https://github.com/hafgit99/kalderashield/releases/latest/download/android-latest.json";

/// The whole check has to finish quickly enough to feel like a startup task.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

/// The manifest is a couple of kilobytes. Anything near this is not ours.
const MAX_MANIFEST_BYTES: usize = 256 * 1024;

/// The initial URL plus the redirects `github.com` may issue before the asset
/// host answers. Five is more than the two hops the release currently uses.
const MAX_REDIRECTS: usize = 5;

/// Whether `url` is part of the release infrastructure.
///
/// A redirect is followed only when it stays on HTTPS and on `github.com` or a
/// `*.githubusercontent.com` subdomain -- the two hosts the release uses to
/// serve assets. The check exists because the request happens outside the
/// browser: without it, a compromised DNS answer or a redirect issued by the
/// wrong server could carry the fetch to an arbitrary host.
fn is_release_host(url: &reqwest::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }

    match url.host_str() {
        Some("github.com") => true,
        Some(host) => host.ends_with(".githubusercontent.com"),
        None => false,
    }
}

fn redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() > MAX_REDIRECTS {
            return attempt.error("too many redirects");
        }
        if !is_release_host(attempt.url()) {
            return attempt.error("refusing to follow a redirect outside the release hosts");
        }
        attempt.follow()
    })
}

/// The TLS configuration: rustls with the bundled Mozilla roots.
///
/// `rustls` is already in the build through the updater plugin, with the `ring`
/// provider, so this adds no new cryptography and no new native build step.
fn tls_config() -> Result<rustls::ClientConfig, String> {
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    Ok(rustls::ClientConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .map_err(|error| format!("failed to build the TLS configuration: {error}"))?
    .with_root_certificates(roots)
    .with_no_client_auth())
}

/// Fetches the Android update manifest and returns it as text.
///
/// The page parses the JSON: keeping the schema in one place (TypeScript) means
/// a new manifest field does not need a Rust release to be readable. What this
/// command guarantees is only what the webview could not: a bounded, redirect
/// checked, TLS verified read of one fixed URL.
#[tauri::command]
pub async fn fetch_android_update_manifest() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent(concat!("KalderaShield/", env!("CARGO_PKG_VERSION")))
        .timeout(REQUEST_TIMEOUT)
        .redirect(redirect_policy())
        .use_preconfigured_tls(tls_config()?)
        .build()
        .map_err(|error| format!("failed to build the HTTP client: {error}"))?;

    let response = client
        .get(MANIFEST_URL)
        .send()
        .await
        .map_err(|error| format!("update manifest request failed: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "update manifest request failed with HTTP {status}."
        ));
    }

    // Refuse before reading when the server announces an oversized body, and
    // again after reading, because `content-length` is optional and is only a
    // hint when present.
    if response
        .content_length()
        .is_some_and(|length| length > MAX_MANIFEST_BYTES as u64)
    {
        return Err("update manifest is larger than expected.".to_string());
    }

    let body = response
        .bytes()
        .await
        .map_err(|error| format!("failed to read the update manifest: {error}"))?;

    if body.len() > MAX_MANIFEST_BYTES {
        return Err("update manifest is larger than expected.".to_string());
    }

    String::from_utf8(body.into()).map_err(|_| "update manifest is not valid UTF-8.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(value: &str) -> reqwest::Url {
        reqwest::Url::parse(value).expect("test URL should parse")
    }

    #[test]
    fn accepts_the_hosts_the_release_uses() {
        assert!(is_release_host(&url(MANIFEST_URL)));
        assert!(is_release_host(&url(
            "https://release-assets.githubusercontent.com/github-production-release-asset/1/2"
        )));
        assert!(is_release_host(&url(
            "https://objects.githubusercontent.com/some/asset"
        )));
    }

    #[test]
    fn refuses_redirects_that_leave_the_release_hosts() {
        assert!(!is_release_host(&url("http://github.com/x")));
        assert!(!is_release_host(&url("https://example.com/x")));
        // A lookalike suffix is not a subdomain: the dot is what makes it one.
        assert!(!is_release_host(&url(
            "https://evilgithubusercontent.com/x"
        )));
        assert!(!is_release_host(&url("https://github.com.evil.example/x")));
        // The bare apex serves no assets and is not accepted.
        assert!(!is_release_host(&url("https://githubusercontent.com/x")));
    }

    #[test]
    fn builds_a_tls_configuration() {
        // Compilation proves the bundled roots and the `ring` provider are the
        // versions rustls expects; this only guards the error path.
        assert!(tls_config().is_ok());
    }

    // Not part of `cargo test`: it reaches the network. Run it by hand with
    // `cargo test -- --ignored` after changing the channel, the redirect
    // policy or the TLS setup -- it is the only check that exercises the
    // redirect to the asset host the way the app will.
    #[test]
    #[ignore = "reaches the network"]
    fn fetches_the_published_manifest() {
        let body = tauri::async_runtime::block_on(fetch_android_update_manifest())
            .expect("the release must serve the manifest");
        assert!(body.contains("\"version\""));
        assert!(body.contains("\"apk\""));
    }
}
