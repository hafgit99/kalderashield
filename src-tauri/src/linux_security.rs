#[cfg(any(target_os = "linux", test))]
use std::path::{Path, PathBuf};

/// Trusted immutable system binary directories searched instead of user `PATH`.
#[cfg(target_os = "linux")]
const TRUSTED_LINUX_BIN_DIRS: &[&str] = &["/usr/bin", "/bin"];

/// F-09: Resolves a fixed system binary name strictly inside trusted root-owned
/// directories without consulting `PATH`, rejecting any path separators or
/// traversal characters.
#[cfg(any(target_os = "linux", test))]
pub fn resolve_trusted_system_binary_in(
    binary_name: &str,
    trusted_dirs: &[&str],
) -> Option<PathBuf> {
    if binary_name.is_empty()
        || !binary_name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return None;
    }

    for dir in trusted_dirs {
        let candidate = Path::new(dir).join(binary_name);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn run_trusted_system_command(binary_name: &str, args: &[&str]) -> Option<std::process::Output> {
    let binary_path = resolve_trusted_system_binary_in(binary_name, TRUSTED_LINUX_BIN_DIRS)?;
    let mut cmd = std::process::Command::new(binary_path);
    cmd.env_clear();
    for env_key in ["XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"] {
        if let Ok(val) = std::env::var(env_key) {
            cmd.env(env_key, val);
        }
    }
    cmd.args(args).output().ok()
}

#[cfg(target_os = "linux")]
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "linux")]
static MONITORING_STARTED: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);
#[cfg(target_os = "linux")]
static SCREEN_RECORDING_DETECTED: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

#[cfg(target_os = "linux")]
pub fn get_linux_display_server() -> String {
    std::env::var("XDG_SESSION_TYPE")
        .unwrap_or_else(|_| {
            if std::env::var("WAYLAND_DISPLAY").is_ok() {
                "wayland".to_string()
            } else if std::env::var("DISPLAY").is_ok() {
                "x11".to_string()
            } else {
                "unknown".to_string()
            }
        })
        .to_lowercase()
}

#[cfg(target_os = "linux")]
fn check_running_recorders_proc() -> bool {
    let recorder_names = [
        "obs",
        "wf-recorder",
        "simplescreenrecorder",
        "kazam",
        "recordmydesktop",
        "green-recorder",
        "peek",
        "spectacle",
        "gnome-screenshot",
        "flameshot",
        "screencast",
        "pw-screen-recorder",
        "pw-record",
    ];

    if let Ok(entries) = std::fs::read_dir("/proc") {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.chars().all(|c| c.is_ascii_digit()) {
                        if let Ok(comm) = std::fs::read_to_string(path.join("comm")) {
                            let comm_trimmed = comm.trim().to_lowercase();
                            for &rec in &recorder_names {
                                if comm_trimmed == rec || comm_trimmed.contains(rec) {
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    false
}

#[cfg(target_os = "linux")]
fn check_pipewire_recording() -> bool {
    if let Some(output) = run_trusted_system_command("pw-dump", &[]) {
        if output.status.success() {
            if let Ok(json_str) = std::str::from_utf8(&output.stdout) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                    if let Some(arr) = val.as_array() {
                        for item in arr {
                            if item.get("type")
                                == Some(&serde_json::Value::String(
                                    "PipeWire:Interface:Node".to_string(),
                                ))
                            {
                                if let Some(info) = item.get("info") {
                                    let state =
                                        info.get("state").and_then(|s| s.as_str()).unwrap_or("");
                                    if state == "running" {
                                        if let Some(props) = info.get("props") {
                                            let media_class = props
                                                .get("media.class")
                                                .and_then(|m| m.as_str())
                                                .unwrap_or("");
                                            let node_name = props
                                                .get("node.name")
                                                .and_then(|n| n.as_str())
                                                .unwrap_or("")
                                                .to_lowercase();
                                            let media_name = props
                                                .get("media.name")
                                                .and_then(|m| m.as_str())
                                                .unwrap_or("")
                                                .to_lowercase();
                                            if media_class == "Video/Source" {
                                                let is_cam = node_name.contains("camera")
                                                    || node_name.contains("webcam")
                                                    || media_name.contains("camera")
                                                    || media_name.contains("webcam");
                                                if !is_cam {
                                                    return true;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    false
}

#[cfg(target_os = "linux")]
fn check_dbus_screencast_sessions() -> bool {
    if let Some(output) = run_trusted_system_command(
        "busctl",
        &["--user", "tree", "org.freedesktop.portal.Desktop"],
    ) {
        if output.status.success() {
            if let Ok(stdout_str) = std::str::from_utf8(&output.stdout) {
                if stdout_str.contains("/org/freedesktop/portal/desktop/session/") {
                    return true;
                }
            }
        }
    }
    if let Some(output) = run_trusted_system_command(
        "busctl",
        &["--user", "tree", "org.freedesktop.portal.ScreenCast"],
    ) {
        if output.status.success() {
            if let Ok(stdout_str) = std::str::from_utf8(&output.stdout) {
                if stdout_str.contains("/org/freedesktop/portal/desktop/session/")
                    || stdout_str.contains("/session/")
                {
                    return true;
                }
            }
        }
    }
    if let Some(output) = run_trusted_system_command(
        "dbus-send",
        &[
            "--session",
            "--dest=org.freedesktop.portal.Desktop",
            "--type=method_call",
            "--print-reply",
            "/org/freedesktop/portal/desktop",
            "org.freedesktop.DBus.Introspectable.Introspect",
        ],
    ) {
        if output.status.success() {
            if let Ok(stdout_str) = std::str::from_utf8(&output.stdout) {
                if stdout_str.contains("node name=\"session\"") || stdout_str.contains("/session/")
                {
                    return true;
                }
            }
        }
    }
    false
}

#[cfg(target_os = "linux")]
pub fn check_linux_screen_recording() -> bool {
    check_running_recorders_proc() || check_pipewire_recording() || check_dbus_screencast_sessions()
}

#[cfg(target_os = "linux")]
pub fn start_linux_screen_capture_monitor(app_handle: AppHandle) {
    if MONITORING_STARTED.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        loop {
            let is_recording = tauri::async_runtime::spawn_blocking(check_linux_screen_recording)
                .await
                .unwrap_or(false);

            let was_recording =
                SCREEN_RECORDING_DETECTED.swap(is_recording, std::sync::atomic::Ordering::SeqCst);
            if is_recording != was_recording {
                log::info!(
                    "Linux screen capture status changed: is_recording={}",
                    is_recording
                );
                let _ = app_handle.emit("screen-capture-status-changed", is_recording);
            }
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn f09_trusted_binary_resolver_rejects_traversal_and_path_injection() {
        let dir = std::env::temp_dir();
        let dir_str = dir.to_string_lossy().to_string();
        for bad in [
            "",
            "../bin/sh",
            "/usr/bin/busctl",
            "busctl;id",
            "busctl --help",
            "a\\b",
        ] {
            assert_eq!(
                resolve_trusted_system_binary_in(bad, &[dir_str.as_str()]),
                None,
                "unsafe binary name {bad:?} must be refused"
            );
        }
    }

    #[test]
    fn f09_trusted_binary_resolver_finds_binary_only_in_trusted_dirs() {
        let unique = format!("ks-f09-test-{}", std::process::id());
        let dir = std::env::temp_dir().join(&unique);
        let _ = std::fs::create_dir_all(&dir);
        let bin = dir.join("pw-dump");
        std::fs::write(&bin, b"stub").expect("create test stub");

        let dir_str = dir.to_string_lossy().to_string();
        assert_eq!(
            resolve_trusted_system_binary_in("pw-dump", &[dir_str.as_str()]),
            Some(bin.clone())
        );
        assert_eq!(
            resolve_trusted_system_binary_in("nonexistent-tool", &[dir_str.as_str()]),
            None
        );

        let _ = std::fs::remove_dir_all(&dir);
    }
}
