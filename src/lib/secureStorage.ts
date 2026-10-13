/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { invoke } from '@tauri-apps/api/core';

export const secureStorageKeys = {
  rememberedSecretKey: 'KalderaShield_account_secret_key_remembered',
  biometricInfo: 'KalderaShield_biometric_info',
  biometricWrappingSecret: 'KalderaShield_biometric_wrapping_secret',
  recoveryKeyBundle: 'KalderaShield_recovery_key_bundle',
  passwordHintWrappingKey: 'KalderaShield_password_hint_key',
} as const;

interface AndroidSecureStorageBridge {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => boolean;
  removeItem: (key: string) => boolean;
}

declare global {
  interface Window {
    KalderaShieldAndroidSecureStorage?: AndroidSecureStorageBridge;
  }
}

// In-memory cache for desktop secure storage (synced with OS credential manager: DPAPI / Secret Service)
let desktopCache: Map<string, string> | null = null;
let isDesktopStorageSupported = false;
let desktopInitPromise: Promise<void> | null = null;

type DesktopSecureStorageListener = () => void;
const secureStorageListeners = new Set<DesktopSecureStorageListener>();

export function subscribeDesktopSecureStorage(listener: DesktopSecureStorageListener): () => void {
  secureStorageListeners.add(listener);
  return () => {
    secureStorageListeners.delete(listener);
  };
}

function notifyDesktopSecureStorageListeners(): void {
  secureStorageListeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error('Error in secure storage listener:', err);
    }
  });
}

export function getAndroidSecureStorageBridge(): AndroidSecureStorageBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.KalderaShieldAndroidSecureStorage;
  if (!bridge) return null;

  if (
    typeof bridge.getItem !== 'function' ||
    typeof bridge.setItem !== 'function' ||
    typeof bridge.removeItem !== 'function'
  ) {
    return null;
  }

  return bridge;
}

export function isSecureStorageAvailable(): boolean {
  if (getAndroidSecureStorageBridge() !== null) return true;
  return isDesktopStorageSupported;
}

export async function initializeDesktopSecureStorage(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!('__TAURI_INTERNALS__' in window)) return;

  if (desktopInitPromise) {
    return desktopInitPromise;
  }

  desktopInitPromise = (async () => {
    try {
      const available = await invoke<boolean>('is_desktop_secure_storage_available');
      if (available) {
        const items = await invoke<Record<string, string>>('get_all_desktop_secure_items');
        desktopCache = new Map(Object.entries(items));
        isDesktopStorageSupported = true;
      } else {
        isDesktopStorageSupported = false;
        desktopCache = null;
      }
    } catch (e) {
      console.warn('Failed to initialize desktop secure storage:', e);
      isDesktopStorageSupported = false;
      desktopCache = null;
    } finally {
      notifyDesktopSecureStorageListeners();
    }
  })();

  return desktopInitPromise;
}

export function resetDesktopSecureStorageForTests(): void {
  desktopCache = null;
  isDesktopStorageSupported = false;
  desktopInitPromise = null;
  secureStorageListeners.clear();
}

export function setDesktopSecureStorageCacheForTests(items: Record<string, string>): void {
  desktopCache = new Map(Object.entries(items));
  isDesktopStorageSupported = true;
  notifyDesktopSecureStorageListeners();
}

export type SecureStorageResult<T> =
  | { success: true; value: T }
  | { success: false; error: Error };

export function getSecureStorageItem(key: string): string | null {
  const androidBridge = getAndroidSecureStorageBridge();
  if (androidBridge) {
    try {
      return androidBridge.getItem(key);
    } catch {
      return null;
    }
  }

  if (isDesktopStorageSupported && desktopCache) {
    return desktopCache.get(key) ?? null;
  }

  return null;
}

export function setSecureStorageItem(key: string, value: string): boolean {
  const androidBridge = getAndroidSecureStorageBridge();
  if (androidBridge) {
    try {
      return androidBridge.setItem(key, value);
    } catch {
      return false;
    }
  }

  if (isDesktopStorageSupported && desktopCache) {
    desktopCache.set(key, value);
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      invoke<boolean>('set_desktop_secure_item', { key, value }).catch((err) => {
        console.error('Failed to write to desktop secure storage:', err);
      });
    }
    return true;
  }

  return false;
}

export function setSecureStorageItemResult(key: string, value: string): SecureStorageResult<boolean> {
  const androidBridge = getAndroidSecureStorageBridge();
  if (androidBridge) {
    try {
      const ok = androidBridge.setItem(key, value);
      if (!ok) {
        return { success: false, error: new Error(`Failed to store secure item for key '${key}'`) };
      }
      return { success: true, value: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  if (isDesktopStorageSupported && desktopCache) {
    try {
      desktopCache.set(key, value);
      if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        invoke<boolean>('set_desktop_secure_item', { key, value }).catch((err) => {
          console.error('Failed to write to desktop secure storage:', err);
        });
      }
      return { success: true, value: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  return { success: false, error: new Error('Secure storage bridge is unavailable on this platform') };
}

export function removeSecureStorageItem(key: string): boolean {
  const androidBridge = getAndroidSecureStorageBridge();
  if (androidBridge) {
    try {
      return androidBridge.removeItem(key);
    } catch {
      return false;
    }
  }

  if (isDesktopStorageSupported && desktopCache) {
    desktopCache.delete(key);
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      invoke<boolean>('remove_desktop_secure_item', { key }).catch((err) => {
        console.error('Failed to remove from desktop secure storage:', err);
      });
    }
    return true;
  }

  return false;
}
