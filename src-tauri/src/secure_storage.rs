// Desktop Secure Storage — Tauri IPC bridge
//
// Windows: Windows Credential Manager (DPAPI) via `windows-sys`
// Linux:   Secret Service D-Bus (GNOME Keyring / KDE Wallet) via `keyring`
// macOS:   Apple Keychain (Security Framework) via `keyring` (`apple-native`)
//
// This module mirrors the synchronous Android bridge pattern: during app init,
// all known keys are loaded into an in-memory cache, and from that point the
// same synchronous `getItem`/`setItem`/`removeItem` shape is used.  Writes
// fire-and-forget the Rust command *and* update the cache atomically, so every
// subsequent synchronous read sees the latest value.

use crate::credential_handler::CredentialSession;
use base64::Engine;
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use std::collections::HashMap;
use std::sync::Mutex;
use zeroize::Zeroize;

/// Rust-only OS keychain entry used exclusively for sealing/unsealing desktop
/// biometric payloads inside Rust. Deliberately NOT in `KNOWN_KEYS`, so the
/// renderer/WebView can never read or enumerate this key.
const BIOMETRIC_NATIVE_SEAL_KEY: &str = "KalderaShield_biometric_native_seal_key";
const BIOMETRIC_SEAL_AAD: &[u8] = b"kalderashield-desktop-bio-seal-v1";
const BIOMETRIC_SEAL_NONCE_LEN: usize = 24;

#[derive(serde::Serialize, serde::Deserialize)]
struct SealedDesktopBiometricPayload {
    v: u8,
    nonce: String,
    ciphertext: String,
}

fn seal_with_key(key: &[u8; 32], plaintext: &[u8]) -> Result<String, String> {
    let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|_| "invalid seal key")?;
    let mut nonce_bytes = [0u8; BIOMETRIC_SEAL_NONCE_LEN];
    getrandom::fill(&mut nonce_bytes).map_err(|e| format!("CSPRNG failure: {e}"))?;
    let nonce = XNonce::try_from(&nonce_bytes[..]).map_err(|_| "invalid biometric seal nonce")?;
    let ciphertext = cipher
        .encrypt(
            &nonce,
            Payload {
                msg: plaintext,
                aad: BIOMETRIC_SEAL_AAD,
            },
        )
        .map_err(|_| "biometric seal encryption failed".to_string())?;

    let envelope = SealedDesktopBiometricPayload {
        v: 1,
        nonce: base64::engine::general_purpose::STANDARD.encode(nonce_bytes),
        ciphertext: base64::engine::general_purpose::STANDARD.encode(ciphertext),
    };
    serde_json::to_string(&envelope).map_err(|e| format!("biometric seal encode failed: {e}"))
}

fn unseal_with_key(key: &[u8; 32], sealed_json: &str) -> Result<String, String> {
    let envelope: SealedDesktopBiometricPayload = serde_json::from_str(sealed_json)
        .map_err(|_| "invalid sealed biometric envelope".to_string())?;
    if envelope.v != 1 {
        return Err("unsupported sealed biometric version".to_string());
    }
    let nonce_vec = base64::engine::general_purpose::STANDARD
        .decode(&envelope.nonce)
        .map_err(|_| "invalid biometric seal nonce".to_string())?;
    if nonce_vec.len() != BIOMETRIC_SEAL_NONCE_LEN {
        return Err("invalid biometric seal nonce length".to_string());
    }
    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(&envelope.ciphertext)
        .map_err(|_| "invalid biometric seal ciphertext".to_string())?;
    let nonce = XNonce::try_from(nonce_vec.as_slice())
        .map_err(|_| "invalid biometric seal nonce length".to_string())?;
    let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(|_| "invalid seal key")?;
    let mut plaintext = cipher
        .decrypt(
            &nonce,
            Payload {
                msg: &ciphertext,
                aad: BIOMETRIC_SEAL_AAD,
            },
        )
        .map_err(|_| "biometric seal authentication failed".to_string())?;
    let result = String::from_utf8(plaintext.clone())
        .map_err(|_| "biometric seal payload is not utf8".to_string());
    plaintext.zeroize();
    result
}

fn load_or_create_biometric_seal_key(create_if_missing: bool) -> Result<[u8; 32], String> {
    if !platform::is_available() {
        return Err("desktop secure storage unavailable".to_string());
    }
    if let Some(mut encoded) = platform::get_item(BIOMETRIC_NATIVE_SEAL_KEY) {
        let decoded = base64::engine::general_purpose::STANDARD.decode(&encoded);
        encoded.zeroize();
        if let Ok(mut raw) = decoded {
            if raw.len() == 32 {
                let mut key = [0u8; 32];
                key.copy_from_slice(&raw);
                raw.zeroize();
                return Ok(key);
            }
            raw.zeroize();
        }
    }
    if !create_if_missing {
        return Err("biometric seal key not found".to_string());
    }
    let mut key = [0u8; 32];
    getrandom::fill(&mut key).map_err(|e| format!("CSPRNG failure: {e}"))?;
    let mut encoded = base64::engine::general_purpose::STANDARD.encode(key);
    let stored = platform::set_item(BIOMETRIC_NATIVE_SEAL_KEY, &encoded);
    encoded.zeroize();
    if !stored {
        key.zeroize();
        return Err("failed to persist biometric seal key in OS keychain".to_string());
    }
    Ok(key)
}

/// The in-process credential store.
///
/// Tauri commands run on the async runtime, but the JS callers need a value
/// *now*.  This Mutex backs both the "load all at init" path and individual
/// get/set/remove operations.  The key namespace is small (≤6 entries), so
/// a simple HashMap is fine.
static DESKTOP_STORE: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

// ──────────────────────────────────────────────────────────────────────────────
// Platform implementation: Windows Credential Manager
// ──────────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
mod platform {
    use std::collections::HashMap;
    use windows_sys::Win32::Security::Credentials::{
        CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE,
        CRED_TYPE_GENERIC,
    };

    const TARGET_PREFIX: &str = "KalderaShield/";

    /// Builds a wide (UTF-16) null-terminated string.
    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// Full target name for a key: `KalderaShield/<key>`.
    fn target_name(key: &str) -> String {
        format!("{TARGET_PREFIX}{key}")
    }

    pub fn is_available() -> bool {
        true // Credential Manager is always present on Windows.
    }

    pub fn get_item(key: &str) -> Option<String> {
        let target = wide(&target_name(key));
        let mut cred_ptr: *mut CREDENTIALW = std::ptr::null_mut();

        let ok = unsafe { CredReadW(target.as_ptr(), CRED_TYPE_GENERIC, 0, &mut cred_ptr) };

        if ok == 0 || cred_ptr.is_null() {
            return None;
        }

        let result = unsafe {
            let cred = &*cred_ptr;
            if cred.CredentialBlobSize == 0 || cred.CredentialBlob.is_null() {
                None
            } else {
                let bytes = std::slice::from_raw_parts(
                    cred.CredentialBlob,
                    cred.CredentialBlobSize as usize,
                );
                String::from_utf8(bytes.to_vec()).ok()
            }
        };

        unsafe { CredFree(cred_ptr as *mut _) };
        result
    }

    pub fn set_item(key: &str, value: &str) -> bool {
        let target = wide(&target_name(key));
        let comment = wide("KalderaShield secure storage");
        let blob = value.as_bytes();

        let cred = CREDENTIALW {
            Flags: 0,
            Type: CRED_TYPE_GENERIC,
            TargetName: target.as_ptr() as *mut _,
            Comment: comment.as_ptr() as *mut _,
            LastWritten: unsafe { std::mem::zeroed() },
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_ptr() as *mut _,
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: std::ptr::null_mut(),
            TargetAlias: std::ptr::null_mut(),
            UserName: std::ptr::null_mut(),
        };

        unsafe { CredWriteW(&cred, 0) != 0 }
    }

    pub fn remove_item(key: &str) -> bool {
        let target = wide(&target_name(key));
        unsafe { CredDeleteW(target.as_ptr(), CRED_TYPE_GENERIC, 0) != 0 }
    }

    /// Lists all values under the `KalderaShield/` prefix.
    ///
    /// Used at init time to populate the in-memory cache.  Windows Credential
    /// Manager does not support prefix enumeration cheaply, so we read only the
    /// known keys.
    pub fn load_all(known_keys: &[&str]) -> HashMap<String, String> {
        let mut map = HashMap::new();
        for key in known_keys {
            if let Some(value) = get_item(key) {
                map.insert((*key).to_string(), value);
            }
        }
        map
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Platform implementation: Linux Secret Service D-Bus & macOS Apple Keychain
// ──────────────────────────────────────────────────────────────────────────────

#[cfg(any(target_os = "linux", target_os = "macos"))]
mod platform {
    use keyring::Entry;
    use std::collections::HashMap;

    const SERVICE_NAME: &str = "KalderaShield";

    /// Checks if the native OS keychain provider (Linux Secret Service D-Bus or
    /// macOS Apple Keychain) is reachable.
    ///
    /// If no provider is available, returns false so the app gracefully falls
    /// back to single-factor operation.
    pub fn is_available() -> bool {
        match Entry::new(SERVICE_NAME, "__probe__") {
            Ok(entry) => match entry.get_password() {
                Ok(_) => true,
                Err(keyring::Error::NoEntry) => true,
                Err(_) => false,
            },
            Err(_) => false,
        }
    }

    pub fn get_item(key: &str) -> Option<String> {
        let entry = Entry::new(SERVICE_NAME, key).ok()?;
        entry.get_password().ok()
    }

    pub fn set_item(key: &str, value: &str) -> bool {
        let Ok(entry) = Entry::new(SERVICE_NAME, key) else {
            return false;
        };
        entry.set_password(value).is_ok()
    }

    pub fn remove_item(key: &str) -> bool {
        let Ok(entry) = Entry::new(SERVICE_NAME, key) else {
            return false;
        };
        match entry.delete_credential() {
            Ok(_) => true,
            Err(keyring::Error::NoEntry) => true,
            Err(_) => false,
        }
    }

    pub fn load_all(known_keys: &[&str]) -> HashMap<String, String> {
        let mut map = HashMap::new();
        for key in known_keys {
            if let Some(value) = get_item(key) {
                map.insert((*key).to_string(), value);
            }
        }
        map
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Platform implementation: fallback (mobile / unsupported desktop targets)
// ──────────────────────────────────────────────────────────────────────────────

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
mod platform {
    use std::collections::HashMap;

    pub fn is_available() -> bool {
        false
    }

    pub fn get_item(_key: &str) -> Option<String> {
        None
    }

    pub fn set_item(_key: &str, _value: &str) -> bool {
        false
    }

    pub fn remove_item(_key: &str) -> bool {
        false
    }

    pub fn load_all(_known_keys: &[&str]) -> HashMap<String, String> {
        HashMap::new()
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Known secure-storage keys (mirrors secureStorageKeys in secureStorage.ts)
// ──────────────────────────────────────────────────────────────────────────────

const KNOWN_KEYS: &[&str] = &[
    "KalderaShield_account_secret_key_remembered",
    "KalderaShield_biometric_info",
    "KalderaShield_biometric_wrapping_secret",
    "KalderaShield_recovery_key_bundle",
    "KalderaShield_password_hint_key",
];

/// F-02: Strict key allowlist at the IPC boundary so a renderer cannot read,
/// write, or delete arbitrary credential entries outside the documented set.
pub fn is_known_key(key: &str) -> bool {
    KNOWN_KEYS.contains(&key)
}

// ──────────────────────────────────────────────────────────────────────────────
// Init: called once from Tauri setup to prime the cache
// ──────────────────────────────────────────────────────────────────────────────

pub fn init_desktop_secure_storage() {
    if !platform::is_available() {
        return;
    }
    let loaded = platform::load_all(KNOWN_KEYS);
    if let Ok(mut store) = DESKTOP_STORE.lock() {
        *store = Some(loaded);
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Tauri commands — called from JavaScript via `invoke()`
// ──────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn is_desktop_secure_storage_available() -> bool {
    platform::is_available()
}

#[tauri::command]
pub fn get_desktop_secure_item(key: String) -> Option<String> {
    if !is_known_key(&key) {
        return None;
    }
    // Read from the cache first (populated at init).
    if let Ok(store) = DESKTOP_STORE.lock() {
        if let Some(map) = store.as_ref() {
            return map.get(&key).cloned();
        }
    }
    // Fallback: direct platform read.
    platform::get_item(&key)
}

#[tauri::command]
pub fn set_desktop_secure_item(key: String, mut value: String) -> bool {
    if !is_known_key(&key) {
        value.zeroize();
        return false;
    }
    let ok = platform::set_item(&key, &value);
    if ok {
        if let Ok(mut store) = DESKTOP_STORE.lock() {
            if let Some(map) = store.as_mut() {
                if let Some(mut old) = map.insert(key, value) {
                    old.zeroize();
                }
                return true;
            }
        }
    }
    value.zeroize();
    ok
}

#[tauri::command]
pub fn remove_desktop_secure_item(key: String) -> bool {
    if !is_known_key(&key) {
        return false;
    }
    let ok = platform::remove_item(&key);
    if ok {
        if let Ok(mut store) = DESKTOP_STORE.lock() {
            if let Some(map) = store.as_mut() {
                if let Some(mut old) = map.remove(&key) {
                    old.zeroize();
                }
            }
        }
    }
    ok
}

#[tauri::command]
pub fn get_all_desktop_secure_items() -> HashMap<String, String> {
    if let Ok(store) = DESKTOP_STORE.lock() {
        if let Some(map) = store.as_ref() {
            return map.clone();
        }
    }
    platform::load_all(KNOWN_KEYS)
}

/// F-02/F-04: Seals a desktop biometric credentials payload inside Rust using a
/// Rust-only OS Keychain key (XChaCha20-Poly1305 + AAD). The sealing key never
/// crosses the IPC boundary into JavaScript. Requires an active unlocked session.
#[tauri::command]
pub fn seal_desktop_biometric_bundle(
    session: tauri::State<'_, CredentialSession>,
    mut plaintext: String,
) -> Result<String, String> {
    if let Err(err) = session.require_active_session() {
        plaintext.zeroize();
        return Err(err);
    }
    let mut key = load_or_create_biometric_seal_key(true).inspect_err(|_| {
        plaintext.zeroize();
    })?;
    let res = seal_with_key(&key, plaintext.as_bytes());
    key.zeroize();
    plaintext.zeroize();
    res
}

/// F-02/F-04: Unseals a desktop biometric credentials payload inside Rust using
/// the Rust-only OS Keychain key after native biometric user presence succeeded.
#[tauri::command]
pub fn unseal_desktop_biometric_bundle(sealed_json: String) -> Result<String, String> {
    let mut key = load_or_create_biometric_seal_key(false)?;
    let res = unseal_with_key(&key, &sealed_json);
    key.zeroize();
    res
}

/// Removes the Rust-only biometric seal key from the OS keychain.
#[tauri::command]
pub fn clear_desktop_biometric_seal_key() -> bool {
    if !platform::is_available() {
        return false;
    }
    platform::remove_item(BIOMETRIC_NATIVE_SEAL_KEY)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn f02_known_keys_allowlist_accepts_only_documented_keys() {
        for key in KNOWN_KEYS {
            assert!(is_known_key(key), "documented key {key} must be allowed");
        }
        for rejected in [
            "",
            "__probe__",
            "../other_app",
            "KalderaShield_arbitrary_key",
            "KalderaShield_biometric_info ",
            "kalderashield_biometric_info",
            BIOMETRIC_NATIVE_SEAL_KEY,
        ] {
            assert!(
                !is_known_key(rejected),
                "undocumented or Rust-only key {rejected:?} must be rejected"
            );
        }
    }

    #[test]
    fn f02_ipc_commands_fail_closed_for_unknown_keys() {
        assert_eq!(get_desktop_secure_item("unknown_key".to_string()), None);
        assert_eq!(
            get_desktop_secure_item(BIOMETRIC_NATIVE_SEAL_KEY.to_string()),
            None
        );
        assert!(!set_desktop_secure_item(
            "unknown_key".to_string(),
            "secret".to_string()
        ));
        assert!(!remove_desktop_secure_item("unknown_key".to_string()));
    }

    #[test]
    fn f02_biometric_seal_roundtrip_and_tamper_detection() {
        let key = [0x42u8; 32];
        let payload = r#"{"masterPassword":"s3cr3t!Password","secretKey":"A3-TEST"}"#;
        let sealed = seal_with_key(&key, payload.as_bytes()).expect("seal must succeed");
        assert!(!sealed.contains("s3cr3t!Password"));

        let unsealed = unseal_with_key(&key, &sealed).expect("unseal must succeed");
        assert_eq!(unsealed, payload);

        let wrong_key = [0x24u8; 32];
        assert!(unseal_with_key(&wrong_key, &sealed).is_err());

        let tampered = sealed.replace("\"v\":1", "\"v\":2");
        assert!(unseal_with_key(&key, &tampered).is_err());
    }
}
