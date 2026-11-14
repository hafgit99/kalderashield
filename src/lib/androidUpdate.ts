/**
 * @file androidUpdate.ts
 * @description Android update channel.
 *
 * The Tauri updater plugin supports Windows, Linux and macOS only: its
 * `updater_os()` returns `None` on Android, so `check()` fails with
 * `UnsupportedOs`. An Android build therefore cannot install an update
 * itself, and pretending otherwise would produce a button that does nothing.
 *
 * What Android does support is a sideloaded in-place update: a newer APK
 * signed with the same release keystore and carrying a higher `versionCode`
 * replaces the installed app. So this module does the two halves of that:
 *
 *   1. It reads `android-latest.json` from the release and compares the
 *      announced version with the running one.
 *   2. It opens the APK download in the system browser through the native
 *      bridge, and the user confirms the installation.
 *
 * The manifest is a plain static file rather than the Tauri manifest, because
 * the Tauri manifest's platform keys do not cover Android and the Tauri
 * updater would reject it.
 *
 * The read itself happens in Rust (`fetch_android_update_manifest`), not here.
 * `github.com` redirects the file to `release-assets.githubusercontent.com`,
 * and that host sends no `Access-Control-Allow-Origin` header, so a webview
 * `fetch` can never read the response -- it fails as "Failed to fetch" no
 * matter what the CSP allows. The desktop updater fetches its manifest from
 * Rust for the same reason.
 *
 * @license Apache-2.0
 */

import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { isAndroidRuntime } from './environment';

declare global {
  interface Window {
    /**
     * Native bridge registered by `AndroidUpdateBridge` (Kotlin).
     *
     * It refuses anything that is not an HTTPS URL on an allowlisted host, so
     * a compromised renderer cannot turn it into a "open any URL" primitive.
     */
    KalderaShieldAndroidUpdate?: {
      openExternalUrl: (url: string) => boolean;
    };
  }
}

export interface AndroidUpdateInfo {
  /** The version the release announces, e.g. "7.0.25". */
  version: string;
  /** The Android `versionCode` of that release, when the manifest carries it. */
  versionCode?: number;
  publishedAt?: string;
  notes?: string;
  /** The APK download URL. */
  url: string;
  /** SHA-256 of the APK, so a user can verify the download by hand. */
  sha256?: string;
  /** Size of the APK in bytes. */
  size?: number;
}

export interface AndroidUpdateCheckResult {
  supported: boolean;
  hasUpdate: boolean;
  updateInfo?: AndroidUpdateInfo;
  error?: string;
}

/** Turns a rejected `invoke` (which rejects with the command's `Err`) into text. */
function describeError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Compares two dotted numeric versions.
 *
 * @returns a negative number when `a` is older than `b`, 0 when they are
 * equal, a positive number when `a` is newer.
 */
export function compareVersions(a: string, b: string): number {
  const left = String(a).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const right = String(b).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }

  return 0;
}

function parseManifest(raw: unknown): AndroidUpdateInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const payload = raw as {
    version?: unknown;
    versionCode?: unknown;
    publishedAt?: unknown;
    notes?: unknown;
    apk?: { url?: unknown; sha256?: unknown; size?: unknown };
  };

  const version = typeof payload.version === 'string' ? payload.version.trim() : '';
  const url = typeof payload.apk?.url === 'string' ? payload.apk.url.trim() : '';
  if (!version || !url) return null;

  return {
    version,
    versionCode: typeof payload.versionCode === 'number' ? payload.versionCode : undefined,
    publishedAt: typeof payload.publishedAt === 'string' ? payload.publishedAt : undefined,
    notes: typeof payload.notes === 'string' ? payload.notes : undefined,
    url,
    sha256: typeof payload.apk?.sha256 === 'string' ? payload.apk.sha256 : undefined,
    size: typeof payload.apk?.size === 'number' ? payload.apk.size : undefined,
  };
}

/**
 * Checks whether the release offers an Android build newer than the running
 * one.
 *
 * The comparison is on the version name, which is what the app reports at
 * runtime. The `versionCode` Android uses to decide whether an update is
 * allowed is derived from that same version, so a higher version name always
 * means a higher `versionCode`.
 */
export async function checkAndroidUpdate(): Promise<AndroidUpdateCheckResult> {
  if (!isAndroidRuntime()) {
    return { supported: false, hasUpdate: false };
  }

  // The manifest is read in Rust. A webview `fetch` cannot read it: the asset
  // host it redirects to sends no CORS header. See the file header.
  let raw: string;
  try {
    raw = await invoke<string>('fetch_android_update_manifest');
  } catch (error: unknown) {
    return { supported: true, hasUpdate: false, error: describeError(error) };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { supported: true, hasUpdate: false, error: 'Update manifest is malformed.' };
  }

  const manifest = parseManifest(payload);
  if (!manifest) {
    return { supported: true, hasUpdate: false, error: 'Update manifest is malformed.' };
  }

  let currentVersion = '';
  try {
    currentVersion = (await getVersion()) || '';
  } catch {
    currentVersion = '';
  }

  if (!currentVersion) {
    return { supported: true, hasUpdate: false, error: 'The installed version is unknown.' };
  }

  if (compareVersions(manifest.version, currentVersion) <= 0) {
    return { supported: true, hasUpdate: false };
  }

  return { supported: true, hasUpdate: true, updateInfo: manifest };
}

/**
 * Opens the APK download in the system browser.
 *
 * The user downloads and confirms the installation; Android performs an
 * in-place update because the APK carries the same release keystore and a
 * higher `versionCode`.
 */
export async function openAndroidUpdate(url: string): Promise<{ success: boolean; error?: string }> {
  if (typeof window === 'undefined') {
    return { success: false, error: 'No window available.' };
  }

  const bridge = window.KalderaShieldAndroidUpdate;
  if (!bridge || typeof bridge.openExternalUrl !== 'function') {
    return { success: false, error: 'The Android update bridge is unavailable.' };
  }

  try {
    const opened = bridge.openExternalUrl(url);
    return opened ? { success: true } : { success: false, error: 'The browser refused to open the download.' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}
