/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isDesktopFileDialogSupported,
  isNativeFileDialogSupported,
  saveDesktopExportFile,
  saveDesktopBinaryFile,
  openDesktopImportFile,
  MAX_ANDROID_PAYLOAD_BYTES,
} from './desktopFiles';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('desktopFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).KalderaShieldAndroidFiles;
    delete (window as any).__KalderaShieldAndroidFiles;
  });

  it('returns false for desktop file dialog when not in Tauri environment', () => {
    expect(isDesktopFileDialogSupported()).toBe(false);
    expect(isNativeFileDialogSupported()).toBe(false);
  });

  it('detects desktop file dialog support in desktop Tauri environment', () => {
    (window as any).__TAURI_INTERNALS__ = {};
    expect(isDesktopFileDialogSupported()).toBe(true);
    expect(isNativeFileDialogSupported()).toBe(true);
  });

  it('saves desktop export file via Tauri invoke', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockResolvedValueOnce(true);

    const saved = await saveDesktopExportFile('backup.json', '{"test":1}');
    expect(saved).toBe(true);
    expect(invoke).toHaveBeenCalledWith('save_export_file', {
      defaultFilename: 'backup.json',
      contents: '{"test":1}',
    });
  });

  it('saves desktop binary file via Tauri invoke', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockResolvedValueOnce(true);

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const saved = await saveDesktopBinaryFile('backup.KalderaShield', bytes);
    expect(saved).toBe(true);
    expect(invoke).toHaveBeenCalledWith('save_binary_file', {
      defaultFilename: 'backup.KalderaShield',
      contentsBase64: expect.any(String),
    });
  });

  it('opens desktop import file via Tauri invoke', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockResolvedValueOnce({ name: 'backup.json', contents: '{"items":[]}' });

    const file = await openDesktopImportFile();
    expect(file).toEqual({ name: 'backup.json', contents: '{"items":[]}' });
    expect(invoke).toHaveBeenCalledWith('open_import_file');
  });

  it('returns null/false when saving or opening on unsupported non-Tauri runtime', async () => {
    expect(await saveDesktopExportFile('test.json', '{}')).toBe(false);
    expect(await saveDesktopBinaryFile('test.KalderaShield', new Uint8Array())).toBe(false);
    expect(await openDesktopImportFile()).toBeNull();
  });

  it('handles Android file bridge save and open requests', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    const saveMock = vi.fn((requestId) => {
      setTimeout(() => {
        window.__KalderaShieldAndroidFiles?.resolveSave(requestId, true);
      }, 10);
    });
    const saveBase64Mock = vi.fn((requestId) => {
      setTimeout(() => {
        window.__KalderaShieldAndroidFiles?.resolveSave(requestId, true);
      }, 10);
    });
    const openMock = vi.fn((requestId) => {
      setTimeout(() => {
        window.__KalderaShieldAndroidFiles?.resolveOpen(requestId, { name: 'android.json', contents: '{"a":1}' });
      }, 10);
    });

    (window as any).KalderaShieldAndroidFiles = {
      saveTextFile: saveMock,
      saveBase64File: saveBase64Mock,
      openTextFile: openMock,
    };

    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14)');

    expect(isNativeFileDialogSupported()).toBe(true);

    const savedText = await saveDesktopExportFile('backup.json', '{"test":1}');
    expect(savedText).toBe(true);
    expect(saveMock).toHaveBeenCalled();

    const savedBinary = await saveDesktopBinaryFile('backup.KalderaShield', new Uint8Array([10, 20]));
    expect(savedBinary).toBe(true);
    expect(saveBase64Mock).toHaveBeenCalled();

    const opened = await openDesktopImportFile();
    expect(opened).toEqual({ name: 'android.json', contents: '{"a":1}' });
    expect(openMock).toHaveBeenCalled();
  });

  it('rejects oversized payloads on Android file bridge', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    (window as any).KalderaShieldAndroidFiles = {
      saveTextFile: vi.fn(),
      saveBase64File: vi.fn(),
      openTextFile: vi.fn(),
    };
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14)');

    const largeString = 'a'.repeat(MAX_ANDROID_PAYLOAD_BYTES + 10);
    await expect(saveDesktopExportFile('huge.json', largeString)).rejects.toThrow(/exceeds/i);

    // We test binary save
    const largeBytes = new Uint8Array(MAX_ANDROID_PAYLOAD_BYTES + 100);
    await expect(saveDesktopBinaryFile('huge.KalderaShield', largeBytes)).rejects.toThrow(/exceeds/i);
  });

  it('handles bridge errors properly', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    (window as any).KalderaShieldAndroidFiles = {
      saveTextFile: vi.fn((requestId) => {
        setTimeout(() => {
          window.__KalderaShieldAndroidFiles?.resolveSave(requestId, false, 'Disk full');
        }, 10);
      }),
      saveBase64File: vi.fn(),
      openTextFile: vi.fn((requestId) => {
        setTimeout(() => {
          window.__KalderaShieldAndroidFiles?.resolveOpen(requestId, null, 'Cancelled');
        }, 10);
      }),
    };
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14)');

    await expect(saveDesktopExportFile('test.json', '{}')).rejects.toThrow('Disk full');
    await expect(openDesktopImportFile()).rejects.toThrow('Cancelled');
  });

  it('handles bridge synchronous exceptions', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    (window as any).KalderaShieldAndroidFiles = {
      saveTextFile: vi.fn(),
      saveBase64File: vi.fn(() => {
        throw new Error('Bridge broken');
      }),
      openTextFile: vi.fn(() => {
        throw new Error('Open bridge broken');
      }),
    };
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14)');

    await expect(saveDesktopBinaryFile('test.bin', new Uint8Array([1]))).rejects.toThrow('Bridge broken');
    await expect(openDesktopImportFile()).rejects.toThrow('Open bridge broken');
  });

  it('falls back to browser download/input on macOS and Linux desktop builds where Win32 dialogs are absent', async () => {
    (window as any).__TAURI_INTERNALS__ = {};

    const uaSpy = vi.spyOn(navigator, 'userAgent', 'get');
    try {
      uaSpy.mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15');
      expect(isDesktopFileDialogSupported()).toBe(false);
      expect(isNativeFileDialogSupported()).toBe(false);
      expect(await saveDesktopExportFile('backup.KalderaShield', '{}')).toBe(false);
      expect(await openDesktopImportFile()).toBeNull();
      expect(invoke).not.toHaveBeenCalled();

      uaSpy.mockReturnValue('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15');
      expect(isDesktopFileDialogSupported()).toBe(false);
      expect(isNativeFileDialogSupported()).toBe(false);
      expect(await saveDesktopExportFile('backup.KalderaShield', '{}')).toBe(false);
      expect(await openDesktopImportFile()).toBeNull();
      expect(invoke).not.toHaveBeenCalled();

      // jsdom on Linux CI uses "(linux) ... jsdom/..." and should keep default desktop dialog behavior
      uaSpy.mockReturnValue('Mozilla/5.0 (linux) AppleWebKit/537.36 (KHTML, like Gecko) jsdom/26.0.0');
      expect(isDesktopFileDialogSupported()).toBe(true);
    } finally {
      uaSpy.mockRestore();
    }
  });

  it('gracefully falls back if Rust reports Windows-only native dialog error', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockRejectedValueOnce(new Error('native file dialogs are only implemented for Windows desktop builds'));
    expect(await saveDesktopExportFile('backup.KalderaShield', '{}')).toBe(false);

    vi.mocked(invoke).mockRejectedValueOnce(new Error('native file dialogs are only implemented for Windows desktop builds'));
    expect(await openDesktopImportFile()).toBeNull();
  });
});
