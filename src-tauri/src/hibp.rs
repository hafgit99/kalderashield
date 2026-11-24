// Have I Been Pwned (HIBP) v3 k-anonymity range lookup & local offline DB search via Rust.
//
// 1. Online k-anonymity (`fetch_hibp_range`):
//    Moving the outbound range lookup from the WebView into Rust lets the Tauri
//    CSP (`src-tauri/tauri.conf.json`) omit `https://api.pwnedpasswords.com`
//    altogether, leaving desktop and Android WebViews with zero external
//    internet connectivity.
//
// 2. Offline air-gap local file (`select_hibp_local_file`, `check_hibp_local_file`):
//    Performs O(log N) binary search directly on a user-supplied sorted HIBP
//    SHA-1 text file (`pwned-passwords-sha1-ordered-by-hash.txt`) via
//    `std::fs::File` + `Seek`, using < 1 MiB RAM even on 40 GB+ databases and
//    making zero network requests.

use std::cmp::Ordering;
use std::collections::HashSet;
use std::fs::File;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

const HIBP_RANGE_BASE_URL: &str = "https://api.pwnedpasswords.com/range/";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(5);
/// A padded HIBP k-anonymity range response is ~35–55 KiB (~800–1000 lines).
/// Anything above 512 KiB is malformed or hostile.
const MAX_RANGE_BYTES: usize = 512 * 1024;

/// Maximum length of a single valid HIBP line (`40 hex` + `:` + count + `\r\n`).
const MAX_HIBP_LINE_BYTES: usize = 128;
/// Switch from binary seek to bounded linear scan once the byte window fits in
/// a few lines. Guarantees boundary correctness for first/last/adjacent lines.
const BINARY_SEARCH_LINEAR_WINDOW: u64 = 512;
/// Maximum number of SHA-1 hashes accepted in a single local batch lookup.
const MAX_LOCAL_BATCH_HASHES: usize = 5_000;

#[derive(serde::Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalHibpFileInfo {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
}

#[derive(serde::Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalHibpMatch {
    pub hash: String,
    pub count: u64,
}

/// Validates and normalizes a 5-character hexadecimal SHA-1 hash prefix.
fn normalize_prefix(prefix: &str) -> Result<String, String> {
    if prefix.len() != 5 || !prefix.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("HIBP prefix must be exactly 5 hexadecimal characters.".to_string());
    }
    Ok(prefix.to_ascii_uppercase())
}

/// Validates and normalizes a full 40-character hexadecimal SHA-1 digest.
fn normalize_full_sha1(hash: &str) -> Result<String, String> {
    if hash.len() != 40 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("SHA-1 hash must be exactly 40 hexadecimal characters.".to_string());
    }
    Ok(hash.to_ascii_uppercase())
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

/// Parses a single `SHA1:COUNT` line from a local HIBP ordered-by-hash file.
fn parse_hibp_line(raw: &str) -> Option<([u8; 40], u64)> {
    let trimmed = raw
        .trim_end_matches(&['\r', '\n'][..])
        .trim_start_matches('\u{feff}');
    let (hash_part, count_part) = trimmed.split_once(':')?;
    if hash_part.len() != 40 || !hash_part.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let count: u64 = count_part.trim().parse().ok()?;
    let mut upper = [0u8; 40];
    for (dst, src) in upper.iter_mut().zip(hash_part.bytes()) {
        *dst = src.to_ascii_uppercase();
    }
    Some((upper, count))
}

/// Reads a single bounded line starting at the current file cursor.
fn read_bounded_line(reader: &mut BufReader<&mut File>) -> Result<Option<(String, u64)>, String> {
    let mut buf = Vec::with_capacity(64);
    let mut total_read = 0usize;
    loop {
        let available = reader
            .fill_buf()
            .map_err(|e| format!("failed to read local HIBP file: {e}"))?;
        if available.is_empty() {
            break;
        }
        if let Some(newline_pos) = available.iter().position(|&b| b == b'\n') {
            let take = newline_pos + 1;
            if total_read + take > MAX_HIBP_LINE_BYTES {
                return Err("File is not a valid sorted HIBP SHA-1 database.".to_string());
            }
            buf.extend_from_slice(&available[..take]);
            reader.consume(take);
            total_read += take;
            break;
        } else {
            if total_read + available.len() > MAX_HIBP_LINE_BYTES {
                return Err("File is not a valid sorted HIBP SHA-1 database.".to_string());
            }
            let len = available.len();
            buf.extend_from_slice(available);
            reader.consume(len);
            total_read += len;
        }
    }

    if total_read == 0 {
        return Ok(None);
    }

    let line = String::from_utf8(buf)
        .map_err(|_| "File is not a valid sorted HIBP SHA-1 database.".to_string())?;
    Ok(Some((line, total_read as u64)))
}

/// Seeks to `offset` (advancing past any partial line when `offset > 0`) and
/// reads the next complete line, returning `(line_start, line_end, line_text)`.
fn read_complete_line_at(
    file: &mut File,
    file_len: u64,
    offset: u64,
) -> Result<Option<(u64, u64, String)>, String> {
    if offset >= file_len {
        return Ok(None);
    }

    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("failed to seek local HIBP file: {e}"))?;
    let mut reader = BufReader::with_capacity(256, file);

    let mut line_start = offset;
    if offset > 0 {
        // Skip the remainder of the partial line we landed in.
        let mut skipped = 0usize;
        let mut found_newline = false;
        while skipped <= MAX_HIBP_LINE_BYTES {
            let available = reader
                .fill_buf()
                .map_err(|e| format!("failed to read local HIBP file: {e}"))?;
            if available.is_empty() {
                break;
            }
            if let Some(nl) = available.iter().position(|&b| b == b'\n') {
                let take = nl + 1;
                reader.consume(take);
                skipped += take;
                found_newline = true;
                break;
            }
            let len = available.len();
            reader.consume(len);
            skipped += len;
        }
        if !found_newline {
            return Ok(None);
        }
        line_start = offset + skipped as u64;
        if line_start >= file_len {
            return Ok(None);
        }
    }

    let Some((line, len)) = read_bounded_line(&mut reader)? else {
        return Ok(None);
    };
    Ok(Some((line_start, line_start + len, line)))
}

/// Validates that `path` points to a readable, regular, non-empty sorted HIBP
/// SHA-1 file (`40-hex:count` format). Rejects arbitrary non-HIBP files so the
/// IPC command cannot act as an arbitrary file reader.
fn open_and_validate_local_hibp_file(path: &Path) -> Result<(File, LocalHibpFileInfo), String> {
    let metadata = std::fs::metadata(path)
        .map_err(|_| "Local HIBP database file could not be opened.".to_string())?;
    if !metadata.is_file() || metadata.len() < 42 {
        return Err("File is not a valid sorted HIBP SHA-1 database.".to_string());
    }

    let mut file = File::open(path)
        .map_err(|_| "Local HIBP database file could not be opened.".to_string())?;

    // Check first line strictly matches `40-hex:count`
    let mut head = [0u8; MAX_HIBP_LINE_BYTES];
    let n = file
        .read(&mut head)
        .map_err(|_| "Local HIBP database file could not be read.".to_string())?;
    let first_line_end = head[..n].iter().position(|&b| b == b'\n').unwrap_or(n);
    let first_line = std::str::from_utf8(&head[..first_line_end])
        .map_err(|_| "File is not a valid sorted HIBP SHA-1 database.".to_string())?;
    if parse_hibp_line(first_line).is_none() {
        return Err("File is not a valid sorted HIBP SHA-1 database.".to_string());
    }

    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("pwned-passwords.txt")
        .to_string();

    Ok((
        file,
        LocalHibpFileInfo {
            path: path.to_string_lossy().into_owned(),
            file_name,
            size_bytes: metadata.len(),
        },
    ))
}

/// O(log N) binary search for a 40-char uppercase hex SHA-1 hash inside an
/// open, sorted HIBP SHA-1 text file. Uses < 1 KiB of stack/heap buffer.
fn binary_search_hibp_file(
    file: &mut File,
    file_len: u64,
    target_hash: &[u8; 40],
) -> Result<Option<u64>, String> {
    let mut lo: u64 = 0;
    let mut hi: u64 = file_len;

    while hi.saturating_sub(lo) > BINARY_SEARCH_LINEAR_WINDOW {
        let mid = lo + (hi - lo) / 2;
        match read_complete_line_at(file, file_len, mid)? {
            None => {
                // `mid` landed inside the final line of the file.
                hi = mid;
            }
            Some((line_start, line_end, line)) => {
                let Some((hash, count)) = parse_hibp_line(&line) else {
                    return Err("File is not a valid sorted HIBP SHA-1 database.".to_string());
                };
                match target_hash.cmp(&hash) {
                    Ordering::Equal => return Ok(if count > 0 { Some(count) } else { None }),
                    Ordering::Less => {
                        if line_start >= hi {
                            break;
                        }
                        hi = line_start;
                    }
                    Ordering::Greater => {
                        if line_end <= lo {
                            break;
                        }
                        lo = line_end;
                    }
                }
            }
        }
    }

    // Bounded linear scan over `[lo.saturating_sub(MAX_HIBP_LINE_BYTES), hi + MAX_HIBP_LINE_BYTES]`.
    let scan_start = lo.saturating_sub(MAX_HIBP_LINE_BYTES as u64);
    let scan_end = hi.saturating_add(MAX_HIBP_LINE_BYTES as u64).min(file_len);

    let Some((first_start, first_end, first_line)) =
        read_complete_line_at(file, file_len, scan_start)?
    else {
        return Ok(None);
    };

    let mut pos = first_end;
    if first_start <= scan_end {
        if let Some((hash, count)) = parse_hibp_line(&first_line) {
            match target_hash.cmp(&hash) {
                Ordering::Equal => return Ok(if count > 0 { Some(count) } else { None }),
                Ordering::Less => return Ok(None),
                Ordering::Greater => {}
            }
        }
    }

    file.seek(SeekFrom::Start(pos))
        .map_err(|e| format!("failed to seek local HIBP file: {e}"))?;
    let mut reader = BufReader::with_capacity(512, file);
    while pos <= scan_end {
        let Some((line, len)) = read_bounded_line(&mut reader)? else {
            break;
        };
        let line_start = pos;
        pos += len;
        if line_start > scan_end {
            break;
        }
        let Some((hash, count)) = parse_hibp_line(&line) else {
            continue;
        };
        match target_hash.cmp(&hash) {
            Ordering::Equal => return Ok(if count > 0 { Some(count) } else { None }),
            Ordering::Less => return Ok(None),
            Ordering::Greater => {}
        }
    }

    Ok(None)
}

#[cfg(target_os = "windows")]
fn native_open_hibp_file_path() -> Result<Option<PathBuf>, String> {
    use windows_sys::Win32::UI::Controls::Dialogs::{
        GetOpenFileNameW, OFN_EXPLORER, OFN_FILEMUSTEXIST, OFN_NOCHANGEDIR, OFN_PATHMUSTEXIST,
        OPENFILENAMEW,
    };

    const BUFFER_LEN: usize = 32768;
    let mut file_buffer = vec![0u16; BUFFER_LEN];
    let mut filter: Vec<u16> = Vec::new();
    for segment in [
        "HIBP SHA-1 Database (*.txt)",
        "*.txt",
        "All Files (*.*)",
        "*.*",
    ] {
        filter.extend(segment.encode_utf16());
        filter.push(0);
    }
    filter.push(0);

    let mut dialog = OPENFILENAMEW {
        lStructSize: std::mem::size_of::<OPENFILENAMEW>() as u32,
        lpstrFilter: filter.as_ptr(),
        lpstrFile: file_buffer.as_mut_ptr(),
        nMaxFile: file_buffer.len() as u32,
        Flags: OFN_EXPLORER | OFN_FILEMUSTEXIST | OFN_NOCHANGEDIR | OFN_PATHMUSTEXIST,
        ..OPENFILENAMEW::default()
    };

    let selected = unsafe { GetOpenFileNameW(&mut dialog) != 0 };
    if !selected {
        return Ok(None);
    }

    let len = file_buffer
        .iter()
        .position(|&unit| unit == 0)
        .unwrap_or(file_buffer.len());
    if len == 0 {
        return Ok(None);
    }
    Ok(Some(PathBuf::from(String::from_utf16_lossy(
        &file_buffer[..len],
    ))))
}

#[cfg(not(target_os = "windows"))]
fn native_open_hibp_file_path() -> Result<Option<PathBuf>, String> {
    Err("Native file picker for local HIBP files is currently available on Windows desktop; enter a file path directly on this platform.".to_string())
}

/// Opens a native file dialog for selecting a local sorted HIBP SHA-1 file,
/// validates its header, and returns its metadata without loading it into RAM.
#[tauri::command]
pub fn select_hibp_local_file() -> Result<Option<LocalHibpFileInfo>, String> {
    let Some(path) = native_open_hibp_file_path()? else {
        return Ok(None);
    };
    let (_file, info) = open_and_validate_local_hibp_file(&path)?;
    Ok(Some(info))
}

/// Validates a user-supplied path to a local sorted HIBP SHA-1 database file.
#[tauri::command]
pub fn validate_hibp_local_file(path: String) -> Result<LocalHibpFileInfo, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Local HIBP file path is empty.".to_string());
    }
    let (_file, info) = open_and_validate_local_hibp_file(Path::new(trimmed))?;
    Ok(info)
}

/// Checks a batch of 40-char hex SHA-1 hashes against a local sorted HIBP file
/// using O(log N) binary search with zero network access and < 1 MiB RAM.
#[tauri::command]
pub fn check_hibp_local_file(
    path: String,
    hashes: Vec<String>,
) -> Result<Vec<LocalHibpMatch>, String> {
    if hashes.len() > MAX_LOCAL_BATCH_HASHES {
        return Err("Too many hashes in a single local HIBP scan request.".to_string());
    }

    let (mut file, info) = open_and_validate_local_hibp_file(Path::new(path.trim()))?;
    let mut seen = HashSet::with_capacity(hashes.len());
    let mut matches = Vec::new();

    for raw_hash in hashes {
        let normalized = normalize_full_sha1(&raw_hash)?;
        if !seen.insert(normalized.clone()) {
            continue;
        }
        let mut target_bytes = [0u8; 40];
        target_bytes.copy_from_slice(normalized.as_bytes());

        if let Some(count) = binary_search_hibp_file(&mut file, info.size_bytes, &target_bytes)? {
            matches.push(LocalHibpMatch {
                hash: normalized,
                count,
            });
        }
    }

    Ok(matches)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn make_temp_hibp_file(name: &str, contents: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "kalderashield-hibp-test-{}-{name}.txt",
            std::process::id()
        ));
        let mut f = File::create(&path).expect("create temp hibp file");
        f.write_all(contents.as_bytes()).expect("write temp hibp");
        path
    }

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

    #[test]
    fn binary_searches_large_sorted_hibp_file_with_crlf_and_lf() {
        // Build a sorted 300-entry HIBP SHA-1 file (~14 KB, larger than the 512B linear window)
        let mut lines = Vec::new();
        for i in 0..300u32 {
            // Evenly spaced 40-char hex hashes in ascending order
            lines.push(format!("{i:040X}:{}", (i + 1) * 7));
        }
        // Include SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8 in sorted position
        let pw_hash = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8";
        lines.push(format!("{pw_hash}:987654"));
        lines.sort();

        for (suffix, sep) in [("lf", "\n"), ("crlf", "\r\n")] {
            let content = lines.join(sep);
            let path = make_temp_hibp_file(suffix, &content);
            let path_str = path.to_string_lossy().into_owned();

            let query = vec![
                format!("{:040X}", 0u32),                               // first line
                format!("{:040X}", 150u32),                             // middle line
                format!("{:040X}", 299u32),                             // near-end line
                pw_hash.to_lowercase(), // case-insensitive match + last line
                "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF".to_string(), // > last
                "0000000000000000000000000000000000000099".to_string(), // missing middle (hex 0x99 = 153 exists, let's check missing below)
                "1111111111111111111111111111111111111111".to_string(), // missing between 299 and 5BAA...
            ];

            let found = check_hibp_local_file(path_str, query).expect("local scan succeeds");
            let map: std::collections::HashMap<String, u64> =
                found.into_iter().map(|m| (m.hash, m.count)).collect();

            assert_eq!(map.get(&format!("{:040X}", 0u32)), Some(&7));
            assert_eq!(map.get(&format!("{:040X}", 150u32)), Some(&(151 * 7)));
            assert_eq!(map.get(&format!("{:040X}", 299u32)), Some(&(300 * 7)));
            assert_eq!(map.get(pw_hash), Some(&987654));
            assert!(!map.contains_key("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"));
            assert!(!map.contains_key("1111111111111111111111111111111111111111"));

            let _ = std::fs::remove_file(path);
        }
    }

    #[test]
    fn binary_searches_single_line_hibp_file() {
        let pw_hash = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8";
        let path = make_temp_hibp_file("single", &format!("{pw_hash}:42"));
        let found = check_hibp_local_file(
            path.to_string_lossy().into_owned(),
            vec![
                pw_hash.to_string(),
                "0000000000000000000000000000000000000000".to_string(),
            ],
        )
        .expect("single-line lookup succeeds");

        assert_eq!(
            found,
            vec![LocalHibpMatch {
                hash: pw_hash.to_string(),
                count: 42
            }]
        );
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn rejects_non_hibp_files_and_invalid_hashes() {
        let non_hibp = make_temp_hibp_file("not-hibp", "root:x:0:0:root:/root:/bin/bash\n");
        let err = validate_hibp_local_file(non_hibp.to_string_lossy().into_owned());
        assert!(err.is_err());
        let _ = std::fs::remove_file(non_hibp);

        let valid = make_temp_hibp_file("bad-hash", "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8:1\n");
        assert!(check_hibp_local_file(
            valid.to_string_lossy().into_owned(),
            vec!["not-a-sha1".to_string()],
        )
        .is_err());
        let _ = std::fs::remove_file(valid);
    }
}
