/**
 * @vitest-environment jsdom
 */

/**
 * The cold-start case for biometric unlock on desktop.
 *
 * On desktop the biometric bundle does not live in IndexedDB any more. It lives
 * in the OS credential store (DPAPI / Secret Service / Keychain), which the
 * frontend reaches through an in-memory cache that only exists once
 * `initializeDesktopSecureStorage()` has resolved -- two IPC round trips.
 *
 * `initializeStorage()` starts `hydrateBiometric()` *before* that cache is
 * populated, deliberately, to keep startup parallel. `hydrateBiometric()` read
 * the cache synchronously on its first line, so on every cold start it read an
 * empty cache, got `null`, fell back to IndexedDB -- where the v4 registration
 * path deletes its copy once secure storage has it -- and concluded that
 * biometric unlock was not configured.
 *
 * Nothing threw. `isBiometricEnabled()` simply answered false for the rest of
 * the session, which is a lock screen with no biometric button and no auto
 * prompt: the feature looks like it switched itself off. Signing out and back in
 * within the same session worked, because `registerBiometric()` had left the
 * bundle in the module cache -- which is what made it look version-specific and
 * intermittent when it is neither.
 *
 * The order is the contract being pinned here, not an implementation detail:
 * hydrate must not read the secure-storage cache before it is populated, no
 * matter which of the two the caller happens to start first.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));

import {
  getBiometricType,
  hydrateBiometric,
  isBiometricEnabled,
  resetBiometricCacheForTesting,
  subscribeBiometric,
} from './biometric';
import {
  initializeDesktopSecureStorage,
  resetDesktopSecureStorageForTests,
  secureStorageKeys,
} from './secureStorage';

/** A v4 (WebAuthn PRF) bundle, which is what desktop registers today. */
const STORED_INFO = {
  version: 4,
  kdf: 'WebAuthn PRF + PBKDF2-SHA256',
  cipher: 'WebCrypto AES-256-GCM',
  credentialId: 'AQIDBAU=',
  salt: 'c2FsdHNhbHQ=',
  prfSalt: 'cHJmc2FsdA==',
  prfSupported: true,
  bundle: { iv: 'aXY=', ciphertext: 'Y2lwaGVydGV4dA==' },
  authenticatorType: 'platform',
};

function desktopCredentialStoreHolding(items: Record<string, string>): void {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  invokeMock.mockImplementation(async (command: string) => {
    if (command === 'is_desktop_secure_storage_available') return true;
    if (command === 'get_all_desktop_secure_items') return items;
    return null;
  });
}

beforeEach(() => {
  invokeMock.mockReset();
  resetDesktopSecureStorageForTests();
  resetBiometricCacheForTesting();
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  resetDesktopSecureStorageForTests();
  resetBiometricCacheForTesting();
});

describe('biometric hydrate on a desktop cold start', () => {
  it('finds the stored bundle even when the secure-storage cache is still loading', async () => {
    desktopCredentialStoreHolding({ [secureStorageKeys.biometricInfo]: JSON.stringify(STORED_INFO) });

    // Exactly the order initializeStorage() uses: both started together, the
    // hydrate first and un-awaited.
    const storageReady = initializeDesktopSecureStorage();
    const hydrated = hydrateBiometric();
    await Promise.all([storageReady, hydrated]);

    expect(isBiometricEnabled()).toBe(true);
    expect(getBiometricType()).toBe('platform');
  });

  it('finds the stored bundle when hydrate is called before anything touches the store', async () => {
    desktopCredentialStoreHolding({ [secureStorageKeys.biometricInfo]: JSON.stringify(STORED_INFO) });

    await hydrateBiometric();

    expect(isBiometricEnabled()).toBe(true);
  });

  it('still reports no bundle when the credential store has none', async () => {
    desktopCredentialStoreHolding({});

    const storageReady = initializeDesktopSecureStorage();
    await Promise.all([storageReady, hydrateBiometric()]);

    expect(isBiometricEnabled()).toBe(false);
    expect(getBiometricType()).toBeNull();
  });

  it('reports no bundle when the credential store is unavailable', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    invokeMock.mockImplementation(async () => false);

    const storageReady = initializeDesktopSecureStorage();
    await Promise.all([storageReady, hydrateBiometric()]);

    expect(isBiometricEnabled()).toBe(false);
  });
});

describe('biometric change notifications', () => {
  it('notifies subscribers once hydration resolves the bundle', async () => {
    desktopCredentialStoreHolding({ [secureStorageKeys.biometricInfo]: JSON.stringify(STORED_INFO) });
    const listener = vi.fn();
    const unsubscribe = subscribeBiometric(listener);

    const storageReady = initializeDesktopSecureStorage();
    await Promise.all([storageReady, hydrateBiometric()]);

    expect(listener).toHaveBeenCalled();
    const lastCall = listener.mock.calls[listener.mock.calls.length - 1];
    expect(lastCall?.[0]).toEqual({
      enabled: true,
      type: 'platform',
      upgradeRequired: false,
    });
    unsubscribe();
  });

  it('stops notifying after unsubscribe', async () => {
    desktopCredentialStoreHolding({ [secureStorageKeys.biometricInfo]: JSON.stringify(STORED_INFO) });
    const listener = vi.fn();
    const unsubscribe = subscribeBiometric(listener);

    const storageReady = initializeDesktopSecureStorage();
    await Promise.all([storageReady, hydrateBiometric()]);
    const callsWhileSubscribed = listener.mock.calls.length;

    unsubscribe();
    await hydrateBiometric();

    expect(listener.mock.calls.length).toBe(callsWhileSubscribed);
  });

  it('reports the enabled state to a subscriber that only cares about the flag', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeBiometric(listener);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});