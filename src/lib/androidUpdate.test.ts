/**
 * @file androidUpdate.test.ts
 * @description Unit tests for the Android update channel.
 *
 * The Tauri updater does not support Android, so this channel is the only way
 * an Android user hears about a new version. Its correctness therefore rests
 * on two things: the comparison against the running version, and the decision
 * to hand the download to the system browser rather than pretending to install
 * anything.
 *
 * The manifest itself is fetched by the Rust command, so these tests mock
 * `invoke` and check what the channel does with its answer -- including the
 * answer "the request failed", which must never be mistaken for "up to date".
 *
 * @vitest-environment jsdom
 * @license Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { checkAndroidUpdate, compareVersions, openAndroidUpdate } from './androidUpdate';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const MANIFEST = {
  version: '7.0.25',
  publishedAt: '2026-11-13T00:00:00Z',
  notes: 'Security release',
  apk: {
    url: 'https://github.com/hafgit99/kalderashield/releases/download/v7.0.25/app-universal-universal-release.apk',
    sha256: 'a'.repeat(64),
    size: 42,
  },
};

function setUserAgent(userAgent: string): void {
  Object.defineProperty(navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
}

describe('androidUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile');
    vi.mocked(getVersion).mockResolvedValue('7.0.24');
    vi.mocked(invoke).mockResolvedValue(JSON.stringify(MANIFEST));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.KalderaShieldAndroidUpdate;
  });

  describe('compareVersions', () => {
    it('orders dotted numeric versions', () => {
      expect(compareVersions('7.0.25', '7.0.24')).toBeGreaterThan(0);
      expect(compareVersions('7.0.24', '7.0.25')).toBeLessThan(0);
      expect(compareVersions('7.0.24', '7.0.24')).toBe(0);
      expect(compareVersions('7.0.10', '7.0.9')).toBeGreaterThan(0);
      expect(compareVersions('7.1.0', '7.0.99')).toBeGreaterThan(0);
    });

    it('treats a missing segment as zero', () => {
      expect(compareVersions('7.0', '7.0.0')).toBe(0);
      expect(compareVersions('7.0.1', '7.0')).toBeGreaterThan(0);
    });
  });

  describe('checkAndroidUpdate', () => {
    it('reports unsupported outside Android', async () => {
      setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');

      await expect(checkAndroidUpdate()).resolves.toEqual({ supported: false, hasUpdate: false });
      expect(invoke).not.toHaveBeenCalled();
    });

    it('reports an available update', async () => {
      const result = await checkAndroidUpdate();

      expect(result.supported).toBe(true);
      expect(result.hasUpdate).toBe(true);
      expect(result.updateInfo?.version).toBe('7.0.25');
      expect(result.updateInfo?.url).toContain('/download/v7.0.25/');
      expect(result.updateInfo?.sha256).toHaveLength(64);
    });

    it('reports no update when the release is not newer', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(
        JSON.stringify({
          version: '7.0.24',
          apk: { url: 'https://github.com/hafgit99/kalderashield/releases/download/v7.0.24/app.apk' },
        }),
      );

      const result = await checkAndroidUpdate();

      expect(result.hasUpdate).toBe(false);
      expect(result.updateInfo).toBeUndefined();
    });

    it('reports no update when the release is older than the running build', async () => {
      vi.mocked(getVersion).mockResolvedValue('7.1.0');

      const result = await checkAndroidUpdate();

      expect(result.hasUpdate).toBe(false);
    });

    it('surfaces a failing manifest request instead of pretending there is no update', async () => {
      // Silence would be indistinguishable from "you are up to date", and the
      // user would never learn that a newer version exists.
      vi.mocked(invoke).mockRejectedValueOnce(
        'update manifest request failed with HTTP 404 Not Found.',
      );

      const result = await checkAndroidUpdate();

      expect(result.hasUpdate).toBe(false);
      expect(result.error).toMatch(/404/);
    });

    it('surfaces a transport failure from the Rust command', async () => {
      // This is the shape of the error the old webview `fetch` produced
      // ("Failed to fetch"); it must reach the user as a failed check.
      vi.mocked(invoke).mockRejectedValueOnce(
        'update manifest request failed: error sending request for url (https://github.com/…)',
      );

      const result = await checkAndroidUpdate();

      expect(result.hasUpdate).toBe(false);
      expect(result.error).toMatch(/request failed/i);
    });

    it('rejects a malformed manifest', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(JSON.stringify({ version: '7.0.25' }));

      const result = await checkAndroidUpdate();

      expect(result.hasUpdate).toBe(false);
      expect(result.error).toMatch(/malformed/i);
    });

    it('rejects a manifest that is not JSON at all', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('<html>not a manifest</html>');

      const result = await checkAndroidUpdate();

      expect(result.hasUpdate).toBe(false);
      expect(result.error).toMatch(/malformed/i);
    });

    it('reads the manifest through the Rust command', async () => {
      await checkAndroidUpdate();

      expect(invoke).toHaveBeenCalledWith('fetch_android_update_manifest');
    });
  });

  describe('openAndroidUpdate', () => {
    it('asks the native bridge to open the download', async () => {
      const openExternalUrl = vi.fn(() => true);
      window.KalderaShieldAndroidUpdate = { openExternalUrl };

      const result = await openAndroidUpdate('https://github.com/hafgit99/kalderashield/releases/download/v7.0.25/app.apk');

      expect(result.success).toBe(true);
      expect(openExternalUrl).toHaveBeenCalledWith(
        'https://github.com/hafgit99/kalderashield/releases/download/v7.0.25/app.apk',
      );
    });

    it('reports a bridge that refuses the URL', async () => {
      window.KalderaShieldAndroidUpdate = { openExternalUrl: vi.fn(() => false) };

      const result = await openAndroidUpdate('https://example.com/app.apk');

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('reports a missing bridge instead of throwing', async () => {
      const result = await openAndroidUpdate('https://github.com/hafgit99/kalderashield/app.apk');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/bridge/i);
    });
  });
});
