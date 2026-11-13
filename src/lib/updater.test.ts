/**
 * @file updater.test.ts
 * @description Unit tests for the Tauri auto-updater service facade.
 * Covers platform gating, update mapping, error classification, download
 * progress aggregation, and restart fallbacks.
 *
 * @vitest-environment jsdom
 * @license SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkAppUpdate,
  downloadAndApplyUpdate,
  restartApplication,
  type UpdateDownloadProgress,
} from './updater';
import { invoke } from '@tauri-apps/api/core';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

type MockedUpdate = {
  currentVersion: string;
  version: string;
  body?: string;
  date?: string;
  rawJson?: Record<string, unknown>;
  downloadAndInstall: ReturnType<typeof vi.fn>;
};

function makeUpdate(overrides: Partial<MockedUpdate> = {}): Update {
  const events: DownloadEvent[] = [];
  return {
    currentVersion: '7.0.2.0',
    version: '7.0.3.0',
    body: 'Security hardening release',
    date: '2026-08-27',
    rawJson: {},
    downloadAndInstall: vi.fn(async (onEvent?: (e: DownloadEvent) => void) => {
      for (const event of events) onEvent?.(event);
    }),
    ...overrides,
  } as unknown as Update;
}

function emitEvents(update: Update, events: DownloadEvent[]): void {
  (update.downloadAndInstall as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (onEvent?: (e: DownloadEvent) => void) => {
      for (const event of events) onEvent?.(event);
    },
  );
}

function setDesktopRuntime(desktop: boolean, userAgent = 'Mozilla/5.0 Desktop'): void {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    value: desktop ? {} : undefined,
    configurable: true,
  });
  Object.defineProperty(navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
}

describe('updater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setDesktopRuntime(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('checkAppUpdate', () => {
    it('reports unsupported outside the desktop runtime', async () => {
      setDesktopRuntime(false);
      await expect(checkAppUpdate()).resolves.toEqual({ supported: false, hasUpdate: false });
      expect(check).not.toHaveBeenCalled();
    });

    it('reports unsupported on mobile user agents even inside Tauri', async () => {
      setDesktopRuntime(true, 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile');
      await expect(checkAppUpdate()).resolves.toEqual({ supported: false, hasUpdate: false });
      expect(check).not.toHaveBeenCalled();
    });

    it('reports no update when the endpoint has no newer release', async () => {
      vi.mocked(check).mockResolvedValueOnce(null);
      await expect(checkAppUpdate()).resolves.toEqual({ supported: true, hasUpdate: false });
    });

    it('maps a pending update into AppUpdateInfo', async () => {
      const update = makeUpdate();
      vi.mocked(check).mockResolvedValueOnce(update);

      const result = await checkAppUpdate();

      expect(result).toEqual({
        supported: true,
        hasUpdate: true,
        updateInfo: {
          currentVersion: '7.0.2.0',
          version: '7.0.3.0',
          body: 'Security hardening release',
          date: '2026-08-27',
          unsignedPlatforms: [],
          isUnsignedBuild: false,
        },
      });
    });

    it('flags an unsigned build when the manifest declares this platform', async () => {
      // The release pipeline writes `unsigned_platforms` into the manifest for
      // platforms published without an operating-system code signature. The
      // client reads it so the user hears it from the app instead of meeting
      // it as a SmartScreen dialog in the middle of an install.
      setDesktopRuntime(true, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
      const update = makeUpdate({ rawJson: { unsigned_platforms: ['windows'] } });
      vi.mocked(check).mockResolvedValueOnce(update);

      const result = await checkAppUpdate();

      expect(result.updateInfo?.unsignedPlatforms).toEqual(['windows']);
      expect(result.updateInfo?.isUnsignedBuild).toBe(true);
    });

    it('does not flag the build when the declaration names another platform', async () => {
      setDesktopRuntime(true, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
      const update = makeUpdate({ rawJson: { unsigned_platforms: ['macos'] } });
      vi.mocked(check).mockResolvedValueOnce(update);

      const result = await checkAppUpdate();

      expect(result.updateInfo?.unsignedPlatforms).toEqual(['macos']);
      expect(result.updateInfo?.isUnsignedBuild).toBe(false);
    });

    it('treats a malformed declaration as no declaration', async () => {
      setDesktopRuntime(true, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
      const update = makeUpdate({ rawJson: { unsigned_platforms: 'windows' } });
      vi.mocked(check).mockResolvedValueOnce(update);

      const result = await checkAppUpdate();

      expect(result.updateInfo?.unsignedPlatforms).toEqual([]);
      expect(result.updateInfo?.isUnsignedBuild).toBe(false);
    });

    it('classifies release-JSON fetch failures with a localized error key', async () => {
      vi.mocked(check).mockRejectedValueOnce(new Error('Could not fetch a valid release JSON'));

      const result = await checkAppUpdate();

      expect(result.supported).toBe(true);
      expect(result.hasUpdate).toBe(false);
      expect(result.errorKey).toBe('settings.updates.errorNotFound');
    });

    it('passes through unmapped errors without a translation key', async () => {
      vi.mocked(check).mockRejectedValueOnce(new Error('network down'));

      const result = await checkAppUpdate();

      expect(result.error).toBe('network down');
      expect(result.errorKey).toBeUndefined();
    });
  });

  describe('downloadAndApplyUpdate', () => {
    const progressEvents: DownloadEvent[] = [
      { event: 'Started', data: { contentLength: 1000 } },
      { event: 'Progress', data: { chunkLength: 400 } },
      { event: 'Progress', data: { chunkLength: 600 } },
      { event: 'Finished' },
    ];

    // The module caches the active update instance across calls, so every test
    // seeds that cache through the public checkAppUpdate() path first to stay
    // order-independent.
    async function seedCachedUpdate(update: Update | null): Promise<void> {
      vi.mocked(check).mockResolvedValueOnce(update);
      await checkAppUpdate();
    }

    it('refuses to run outside the desktop runtime', async () => {
      setDesktopRuntime(false);
      const result = await downloadAndApplyUpdate();
      expect(result).toEqual({ success: false, error: 'Updater is only available on desktop.' });
    });

    it('downloads the cached update from the check phase and reports percent milestones', async () => {
      const update = makeUpdate();
      emitEvents(update, progressEvents);
      await seedCachedUpdate(update);

      const progress: UpdateDownloadProgress[] = [];
      const result = await downloadAndApplyUpdate((p) => progress.push(p));

      expect(result).toEqual({ success: true });
      expect(update.downloadAndInstall).toHaveBeenCalledTimes(1);
      expect(check).toHaveBeenCalledTimes(1);
      expect(progress).toEqual([
        { total: 1000, downloaded: 0, percent: 0 },
        { total: 1000, downloaded: 400, percent: 40 },
        { total: 1000, downloaded: 1000, percent: 100 },
        { total: 1000, downloaded: 1000, percent: 100 },
      ]);
    });

    it('fails closed when there is no update available to download', async () => {
      await seedCachedUpdate(null);
      vi.mocked(check).mockResolvedValueOnce(null);

      const result = await downloadAndApplyUpdate();

      expect(result).toEqual({ success: false, error: 'No update available to download.' });
    });

    it('caps percent at 100 when total size is unknown', async () => {
      const update = makeUpdate();
      emitEvents(update, [
        { event: 'Started', data: { contentLength: undefined } },
        { event: 'Progress', data: { chunkLength: 512 } },
        { event: 'Finished' },
      ]);
      await seedCachedUpdate(update);

      const progress: UpdateDownloadProgress[] = [];
      await downloadAndApplyUpdate((p) => progress.push(p));

      expect(progress[1]).toEqual({ total: 0, downloaded: 512, percent: 0 });
      expect(progress[2]).toEqual({ total: 0, downloaded: 512, percent: 100 });
    });

    it('surfaces download failures without throwing', async () => {
      const update = makeUpdate();
      emitEvents(update, []);
      (update.downloadAndInstall as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('signature verification failed'),
      );
      await seedCachedUpdate(update);

      const result = await downloadAndApplyUpdate();
      expect(result).toEqual({ success: false, error: 'signature verification failed' });
    });
  });

  describe('restartApplication', () => {
    it('invokes the native restart command on desktop', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);
      await restartApplication();
      expect(invoke).toHaveBeenCalledWith('restart_app');
    });

    it('swallows native restart failures instead of throwing', async () => {
      vi.mocked(invoke).mockRejectedValueOnce(new Error('restart refused'));
      await expect(restartApplication()).resolves.toBeUndefined();
    });
  });
});
