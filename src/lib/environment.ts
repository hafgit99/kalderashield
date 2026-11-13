/**
 * @file environment.ts
 * @description Single source of truth for runtime-environment detection flags.
 * Consolidates duplicated `isDesktopRuntime` / `isTestEnv` helpers that were
 * previously copy-pasted across `argon2id.ts`, `desktopStorage.ts`,
 * `SettingsPanel.tsx`, `useVaultData.ts` and `sqlite_opfs.ts`.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

/** `true` when running inside the Tauri desktop/Android native runtime. */
export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

/** `true` when running inside the Android runtime (Tauri Android or WebView). */
export function isAndroidRuntime(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /Android/i.test(navigator.userAgent || '')
  );
}

/** `true` when running on a true desktop platform (Windows, macOS, Linux) that supports binary auto-updates. */
export function isDesktopAppUpdaterSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isDesktopRuntime()) return false;
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false;
  return true;
}

/**
 * The desktop platform slug used by the release updater manifest
 * (`linux`, `windows`, `darwin`), or `null` when the runtime is not a
 * desktop.
 *
 * This mirrors the naming the updater manifest uses for its platform keys
 * (`windows-x86_64`, `linux-x86_64`, `darwin-aarch64`). The manifest's
 * `unsigned_platforms` array names the platforms in that same vocabulary, so
 * the two have to agree on the spelling: `macos` in the release scripts and
 * `darwin` in the manifest are different words for the same platform, and the
 * comparison is the one place where that matters.
 */
export function currentUpdatePlatform(): 'windows' | 'macos' | 'linux' | null {
  if (typeof window === 'undefined') return null;
  if (!isDesktopRuntime()) return null;
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  // Android is a Linux user agent, but it is not a desktop updater target.
  if (/Android/i.test(ua)) return null;
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return null;
}

/**
 * `true` inside jsdom / happy-dom unit test environments.
 * Used to skip real timers (e.g. `maybeDelay`) during tests.
 */
export const isTestEnv =
  typeof window === 'undefined' ||
  (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('jsdom')) ||
  (typeof window !== 'undefined' && Boolean((window as { __happyDOM__?: unknown }).__happyDOM__));
