/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import {
  getSecureStorageItem,
  initializeDesktopSecureStorage,
  isSecureStorageAvailable,
  removeSecureStorageItem,
  resetDesktopSecureStorageForTests,
  secureStorageKeys,
  setDesktopSecureStorageCacheForTests,
  setSecureStorageItem,
  setSecureStorageItemResult,
} from './secureStorage';

afterEach(() => {
  delete window.KalderaShieldAndroidSecureStorage;
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  resetDesktopSecureStorageForTests();
  mockInvoke.mockReset();
  vi.restoreAllMocks();
});

describe('secure storage bridge', () => {
  it('reports unavailable when both Android and Desktop bridges are missing', () => {
    expect(isSecureStorageAvailable()).toBe(false);
    expect(getSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBeNull();
    expect(setSecureStorageItem(secureStorageKeys.rememberedSecretKey, 'secret')).toBe(false);
    expect(removeSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBe(false);
  });

  it('reports unavailable when the Android bridge shape is incomplete', () => {
    const incompleteBridges = [
      { getItem: vi.fn(() => null) },
      { setItem: vi.fn(() => true) },
      { removeItem: vi.fn(() => true) },
      { getItem: 'not-a-function', setItem: vi.fn(() => true), removeItem: vi.fn(() => true) },
      { getItem: vi.fn(() => null), setItem: 'not-a-function', removeItem: vi.fn(() => true) },
      { getItem: vi.fn(() => null), setItem: vi.fn(() => true), removeItem: 'not-a-function' },
    ];

    for (const bridge of incompleteBridges) {
      window.KalderaShieldAndroidSecureStorage = bridge as unknown as typeof window.KalderaShieldAndroidSecureStorage;
      expect(isSecureStorageAvailable()).toBe(false);
      expect(getSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBeNull();
      expect(setSecureStorageItem(secureStorageKeys.rememberedSecretKey, 'secret')).toBe(false);
      expect(removeSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBe(false);
    }
  });

  it('routes get, set, and remove through the Android secure storage bridge', () => {
    const values = new Map<string, string>();
    window.KalderaShieldAndroidSecureStorage = {
      getItem: vi.fn((key) => values.get(key) ?? null),
      setItem: vi.fn((key, value) => {
        values.set(key, value);
        return true;
      }),
      removeItem: vi.fn((key) => values.delete(key)),
    };

    expect(isSecureStorageAvailable()).toBe(true);
    expect(setSecureStorageItem(secureStorageKeys.rememberedSecretKey, 'secret')).toBe(true);
    expect(getSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBe('secret');
    expect(removeSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBe(true);
    expect(getSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBeNull();
  });

  it('fails closed when the bridge throws', () => {
    window.KalderaShieldAndroidSecureStorage = {
      getItem: vi.fn(() => {
        throw new Error('bridge failed');
      }),
      setItem: vi.fn(() => {
        throw new Error('bridge failed');
      }),
      removeItem: vi.fn(() => {
        throw new Error('bridge failed');
      }),
    };

    expect(getSecureStorageItem(secureStorageKeys.biometricInfo)).toBeNull();
    expect(setSecureStorageItem(secureStorageKeys.biometricInfo, '{}')).toBe(false);
    expect(removeSecureStorageItem(secureStorageKeys.biometricInfo)).toBe(false);
  });

  it('handles setSecureStorageItemResult across available, error, and throwing scenarios', () => {
    // Missing bridge
    delete window.KalderaShieldAndroidSecureStorage;
    const res1 = setSecureStorageItemResult(secureStorageKeys.rememberedSecretKey, 'secret');
    expect(res1.success).toBe(false);

    // Bridge with setItem returning true
    window.KalderaShieldAndroidSecureStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => true),
      removeItem: vi.fn(() => true),
    };
    const res2 = setSecureStorageItemResult(secureStorageKeys.rememberedSecretKey, 'secret');
    expect(res2.success).toBe(true);

    // Bridge with setItem returning false
    window.KalderaShieldAndroidSecureStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => false),
      removeItem: vi.fn(() => false),
    };
    const res3 = setSecureStorageItemResult(secureStorageKeys.rememberedSecretKey, 'secret');
    expect(res3.success).toBe(false);

    // Bridge throwing
    window.KalderaShieldAndroidSecureStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('Disk full');
      }),
      removeItem: vi.fn(() => false),
    };
    const res4 = setSecureStorageItemResult(secureStorageKeys.rememberedSecretKey, 'secret');
    expect(res4.success).toBe(false);
  });

  describe('desktop secure storage', () => {
    it('initializes from Tauri IPC commands and populates cache', async () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'is_desktop_secure_storage_available') return true;
        if (cmd === 'get_all_desktop_secure_items') {
          return {
            [secureStorageKeys.rememberedSecretKey]: 'desktop-secret-123',
          };
        }
        return null;
      });

      await initializeDesktopSecureStorage();

      expect(isSecureStorageAvailable()).toBe(true);
      expect(getSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBe('desktop-secret-123');
    });

    it('handles desktop setItem and removeItem with sync cache and async Tauri calls', async () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      setDesktopSecureStorageCacheForTests({});
      mockInvoke.mockResolvedValue(true);

      expect(isSecureStorageAvailable()).toBe(true);
      expect(setSecureStorageItem(secureStorageKeys.rememberedSecretKey, 'new-val')).toBe(true);
      expect(getSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBe('new-val');
      expect(mockInvoke).toHaveBeenCalledWith('set_desktop_secure_item', {
        key: secureStorageKeys.rememberedSecretKey,
        value: 'new-val',
      });

      expect(removeSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBe(true);
      expect(getSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBeNull();
      expect(mockInvoke).toHaveBeenCalledWith('remove_desktop_secure_item', {
        key: secureStorageKeys.rememberedSecretKey,
      });
    });

    it('falls back gracefully when desktop secure storage reports unavailable', async () => {
      (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
      mockInvoke.mockImplementation(async (cmd: string) => {
        if (cmd === 'is_desktop_secure_storage_available') return false;
        return null;
      });

      await initializeDesktopSecureStorage();

      expect(isSecureStorageAvailable()).toBe(false);
      expect(getSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBeNull();
      expect(setSecureStorageItem(secureStorageKeys.rememberedSecretKey, 'foo')).toBe(false);
    });

    it('handles setSecureStorageItemResult on desktop', () => {
      setDesktopSecureStorageCacheForTests({});
      const res = setSecureStorageItemResult(secureStorageKeys.rememberedSecretKey, 'val');
      expect(res.success).toBe(true);
      expect(getSecureStorageItem(secureStorageKeys.rememberedSecretKey)).toBe('val');
    });
  });
});
