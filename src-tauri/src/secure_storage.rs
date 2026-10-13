// Desktop Secure Storage — Tauri IPC bridge
//
// Windows: Windows Credential Manager (DPAPI) via `wincred` Tauri commands
// Linux:   Secret Service D-Bus (GNOME Keyring / KDE Wallet) — TODO in Commit 2
//
// This module mirrors the synchronous Android bridge pattern: during app init,
// all known keys are loaded into an in-memory cache, and from that point the
// same synchronous `getItem`/`setItem`/`removeItem` shape is used.  Writes
// fire-and-forget the Rust command *and* update the cache atomically, so every
// subsequent synchronous read sees the latest value.

use std::collections::HashMap;
use std::sync::Mutex;

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
        CredDeleteW, CredFree, CredReadW, CredWriteW,
        CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
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

        let ok = unsafe {
            CredReadW(
                target.as_ptr(),
                CRED_TYPE_GENERIC,
                0,
                &mut cred_ptr,
            )
        };

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

        let mut cred = CREDENTIALW {
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

        unsafe { CredWriteW(&mut cred, 0) != 0 }
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
// Platform implementation: Linux Secret Service D-Bus (GNOME Keyring / KDE Wallet)
// ──────────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
mod platform {
    use std::collections::HashMap;
    use keyring::Entry;

    const SERVICE_NAME: &str = "KalderaShield";

    /// Checks if a Secret Service daemon (GNOME Keyring / KDE Wallet) is active.
    ///
    /// If no Secret Service provider is available over D-Bus, this returns false
    /// and the app gracefully falls back to single-factor operation (Faz 1 behaviour).
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
        match entry.get_password() {
            Ok(pwd) => Some(pwd),
            Err(_) => None,
        }
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
// Platform implementation: fallback (macOS, mobile, etc.)
// ──────────────────────────────────────────────────────────────────────────────

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
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
pub fn set_desktop_secure_item(key: String, value: String) -> bool {
    let ok = platform::set_item(&key, &value);
    if ok {
        if let Ok(mut store) = DESKTOP_STORE.lock() {
            if let Some(map) = store.as_mut() {
                map.insert(key, value);
            }
        }
    }
    ok
}

#[tauri::command]
pub fn remove_desktop_secure_item(key: String) -> bool {
    let ok = platform::remove_item(&key);
    if ok {
        if let Ok(mut store) = DESKTOP_STORE.lock() {
            if let Some(map) = store.as_mut() {
                map.remove(&key);
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

