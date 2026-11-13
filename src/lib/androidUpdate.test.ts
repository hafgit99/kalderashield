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
 * @vitest-environment jsdom
 * @license Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ANDROID_UPDATE_MANIFEST_URL,
  checkAndroidUpdate,
  compareVersions,
  openAndroidUpdate,
} from './androidUpdate';
import { getVersion } from '@tauri-apps/api/app';

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn(),
}));

function setUserAgent(userAgent: string): void {
  Object.defineProperty(navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
}

function manifestResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as unknown as Response;
}

describe('androidUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile');
    vi.mocked(getVersion).mockResolvedValue('7.0.24');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        manifestResponse({
          version: '7.0.25',
          publishedAt: '2026-11-13T00:00:00Z',
          notes: 'Security release',
          apk: {
            url: 'https://github.com/hafgit99/kalderashield/releases/download/v7.0.25/app-universal-universal-release.apk',
            sha256: 'a'.repeat(64),
            size: 42,
          },
        }),
      ),
    );
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
      expect(fetch).not.toHaveBeenCalled();
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
      vi.mocked(fetch).mockResolvedValueOnce(
        manifestResponse({
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
      vi.mocked(fetch).mockResolvedValueOnce(manifestResponse({}, 404));

      const result = await checkAndroidUpdate();

      expect(result.hasUpdate).toBe(false);
      expect(result.error).toMatch(/404/);
    });

    it('rejects a malformed manifest', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(manifestResponse({ version: '7.0.25' }));

      const result = await checkAndroidUpdate();

      expect(result.hasUpdate).toBe(false);
      expect(result.error).toMatch(/malformed/i);
    });

    it('reads the manifest from the stable release URL', async () => {
      await checkAndroidUpdate();

      expect(fetch).toHaveBeenCalledWith(
        ANDROID_UPDATE_MANIFEST_URL,
        expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/json' }) }),
      );
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
