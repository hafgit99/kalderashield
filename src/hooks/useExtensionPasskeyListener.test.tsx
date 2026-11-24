/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for useExtensionPasskeyListener covering both Desktop Tauri
 * extension events and Android 14+ Credential Manager bridge flows.
 */

// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultItem } from '../types';
import { closeVaultSession, openVaultSession } from '../lib/vaultSession';
import { bytesToBase64Url } from '../lib/passkeyAssertion';
import { createSoftwarePasskey } from '../lib/passkeyProvider';
import { recordToVaultFields } from '../lib/passkey';

const listenMock = vi.fn();
const resolveExtensionPasskeyRequestMock = vi.fn();

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

vi.mock('../lib/desktopStorage', () => ({
  resolveExtensionPasskeyRequest: (...args: unknown[]) => resolveExtensionPasskeyRequestMock(...args),
}));

import { useExtensionPasskeyListener, type ExtensionPasskeyRequest } from './useExtensionPasskeyListener';

const TEST_VAULT_KEY = new Uint8Array(32).fill(0x5a);

describe('useExtensionPasskeyListener', () => {
  beforeEach(() => {
    openVaultSession('test-master', 'test-master', TEST_VAULT_KEY);
    listenMock.mockReset();
    resolveExtensionPasskeyRequestMock.mockReset();
    resolveExtensionPasskeyRequestMock.mockResolvedValue(undefined);
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    delete window.KalderaShieldAndroidPasskey;
    delete window.__KalderaShieldAndroidPasskey;
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    delete window.KalderaShieldAndroidPasskey;
    delete window.__KalderaShieldAndroidPasskey;
    closeVaultSession();
  });

  it('hydrates an initial pending Android passkey request, creates a passkey, and completes via Android bridge', async () => {
    const completePasskeyRequest = vi.fn((_requestId: string, _responseJson: string) => true);
    const challenge = bytesToBase64Url(new Uint8Array(32).fill(0x11));
    window.KalderaShieldAndroidPasskey = {
      isSupported: () => true,
      getPendingRequest: () =>
        JSON.stringify({
          requestId: 'android-create-1',
          kind: 'create',
          source: 'android-credential-provider',
          createdAt: Date.now(),
          origin: 'https://github.com',
          rpId: 'github.com',
          rpName: 'GitHub',
          userName: 'alice@github.com',
          challengeBase64Url: challenge,
          pubKeyCredAlgs: [-7],
        }),
      completePasskeyRequest,
      cancelPasskeyRequest: vi.fn(() => true),
      failPasskeyRequest: vi.fn(() => true),
    };

    const onSaveItem = vi.fn(async () => undefined);
    const onNotify = vi.fn();

    const { result } = renderHook(() =>
      useExtensionPasskeyListener({ items: [], onSaveItem, onNotify }),
    );

    expect(result.current.pendingPasskeyRequest?.requestId).toBe('android-create-1');
    expect(result.current.pendingPasskeyRequest?.source).toBe('android-credential-provider');

    await act(async () => {
      await result.current.approvePasskeyCreate();
    });

    expect(onSaveItem).toHaveBeenCalledTimes(1);
    expect(completePasskeyRequest).toHaveBeenCalledTimes(1);
    expect(completePasskeyRequest.mock.calls[0]?.[0]).toBe('android-create-1');
    expect(resolveExtensionPasskeyRequestMock).not.toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'GitHub', message: 'alice@github.com', type: 'success' }),
    );
    expect(result.current.pendingPasskeyRequest).toBeNull();
  });

  it('handles Android live get requests, approves assertion, updates signCount, and supports clear/cancel/fallback', async () => {
    const completePasskeyRequest = vi.fn(() => true);
    const cancelPasskeyRequest = vi.fn(() => true);
    window.KalderaShieldAndroidPasskey = {
      isSupported: () => true,
      getPendingRequest: () => null,
      completePasskeyRequest,
      cancelPasskeyRequest,
      failPasskeyRequest: vi.fn(() => true),
    };

    const created = await createSoftwarePasskey({
      origin: 'https://example.org',
      rpId: 'example.org',
      rpName: 'Example',
      userName: 'bob@example.org',
      challengeBase64Url: bytesToBase64Url(new Uint8Array(16).fill(1)),
    });

    const passkeyItem: VaultItem = {
      id: created.record.itemId,
      title: 'Example',
      username: 'bob@example.org',
      password: '',
      url: 'https://example.org',
      notes: '',
      createdAt: created.record.createdAt,
      updatedAt: created.record.createdAt,
      category: 'passkey',
      ...recordToVaultFields(created.record),
    };

    const onSaveItem = vi.fn(async () => undefined);
    const { result } = renderHook(() =>
      useExtensionPasskeyListener({ items: [passkeyItem], onSaveItem }),
    );

    const getChallenge = bytesToBase64Url(new Uint8Array(32).fill(0x22));
    act(() => {
      window.__KalderaShieldAndroidPasskey?.onRequest({
        requestId: 'android-get-1',
        kind: 'get',
        source: 'android-credential-provider',
        createdAt: Date.now(),
        origin: 'https://example.org',
        rpId: 'example.org',
        challengeBase64Url: getChallenge,
      });
    });

    expect(result.current.matchingPasskeyRecords).toHaveLength(1);

    await act(async () => {
      await result.current.approvePasskeyGet(result.current.matchingPasskeyRecords[0]!);
    });

    expect(onSaveItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: passkeyItem.id, passkeySignCount: 1 }),
    );
    expect(completePasskeyRequest).toHaveBeenCalledWith('android-get-1', expect.any(String));
    expect(result.current.pendingPasskeyRequest).toBeNull();

    // Test request cleared notification
    act(() => {
      window.__KalderaShieldAndroidPasskey?.onRequest({
        requestId: 'android-get-2',
        kind: 'get',
        source: 'android-credential-provider',
        createdAt: Date.now(),
        origin: 'https://example.org',
        rpId: 'example.org',
        challengeBase64Url: getChallenge,
      });
    });
    expect(result.current.pendingPasskeyRequest?.requestId).toBe('android-get-2');

    act(() => {
      window.__KalderaShieldAndroidPasskey?.onRequestCleared?.('other-id');
    });
    expect(result.current.pendingPasskeyRequest?.requestId).toBe('android-get-2');

    act(() => {
      window.__KalderaShieldAndroidPasskey?.onRequestCleared?.('android-get-2');
    });
    expect(result.current.pendingPasskeyRequest).toBeNull();

    // Test Android fallback and cancel routing
    act(() => {
      window.__KalderaShieldAndroidPasskey?.onRequest({
        requestId: 'android-get-3',
        kind: 'get',
        source: 'android-credential-provider',
        createdAt: Date.now(),
        origin: 'https://example.org',
        rpId: 'example.org',
        challengeBase64Url: getChallenge,
      });
    });
    await act(async () => {
      await result.current.fallbackPasskeyToDevice();
    });
    expect(cancelPasskeyRequest).toHaveBeenCalledWith('android-get-3');

    act(() => {
      window.__KalderaShieldAndroidPasskey?.onRequest({
        requestId: 'android-get-4',
        kind: 'get',
        source: 'android-credential-provider',
        createdAt: Date.now(),
        origin: 'https://example.org',
        rpId: 'example.org',
        challengeBase64Url: getChallenge,
      });
    });
    await act(async () => {
      await result.current.cancelPasskeyRequest();
    });
    expect(cancelPasskeyRequest).toHaveBeenCalledWith('android-get-4');
  });

  it('listens for Tauri desktop extension events and resolves create, get, fallback, cancel, and error paths', async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    let eventHandler: ((event: { payload: ExtensionPasskeyRequest }) => void) | null = null;
    const unlistenMock = vi.fn();

    listenMock.mockImplementation(
      async (_eventName: string, cb: (event: { payload: ExtensionPasskeyRequest }) => void) => {
        eventHandler = cb;
        return unlistenMock;
      },
    );

    const created = await createSoftwarePasskey({
      origin: 'https://webauthn.io',
      rpId: 'webauthn.io',
      rpName: 'WebAuthn',
      userName: 'carol@webauthn.io',
      challengeBase64Url: bytesToBase64Url(new Uint8Array(16).fill(3)),
    });

    const passkeyItem: VaultItem = {
      id: created.record.itemId,
      title: 'WebAuthn',
      username: 'carol@webauthn.io',
      password: '',
      url: 'https://webauthn.io',
      notes: '',
      createdAt: created.record.createdAt,
      updatedAt: created.record.createdAt,
      category: 'passkey',
      ...recordToVaultFields(created.record),
    };

    const onSaveItem = vi.fn(async () => undefined);
    const { result, unmount } = renderHook(() =>
      useExtensionPasskeyListener({ items: [passkeyItem], onSaveItem }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(listenMock).toHaveBeenCalledWith('extension-passkey-request', expect.any(Function));

    // Malformed payloads are ignored
    act(() => {
      eventHandler?.({ payload: { requestId: '', kind: 'create', origin: '', rpId: '', challengeBase64Url: '' } });
      eventHandler?.({
        payload: {
          requestId: 'bad-kind',
          kind: 'unknown' as 'create',
          origin: 'https://webauthn.io',
          rpId: 'webauthn.io',
          challengeBase64Url: 'abc',
        },
      });
    });
    expect(result.current.pendingPasskeyRequest).toBeNull();

    // Desktop create approval
    const challenge = bytesToBase64Url(new Uint8Array(32).fill(0x44));
    act(() => {
      eventHandler?.({
        payload: {
          requestId: 'desk-create-1',
          kind: 'create',
          origin: 'https://webauthn.io',
          rpId: 'webauthn.io',
          userName: 'dave@webauthn.io',
          challengeBase64Url: challenge,
        },
      });
    });
    await act(async () => {
      await result.current.approvePasskeyCreate();
    });
    expect(resolveExtensionPasskeyRequestMock).toHaveBeenCalledWith(
      'desk-create-1',
      expect.objectContaining({ status: 'ok', credential: expect.any(Object) }),
    );

    // Desktop get approval
    act(() => {
      eventHandler?.({
        payload: {
          requestId: 'desk-get-1',
          kind: 'get',
          origin: 'https://webauthn.io',
          rpId: 'webauthn.io',
          challengeBase64Url: challenge,
        },
      });
    });
    await act(async () => {
      await result.current.approvePasskeyGet(result.current.matchingPasskeyRecords[0]!);
    });
    expect(resolveExtensionPasskeyRequestMock).toHaveBeenCalledWith(
      'desk-get-1',
      expect.objectContaining({ status: 'ok', credential: expect.any(Object) }),
    );

    // Desktop fallback
    act(() => {
      eventHandler?.({
        payload: {
          requestId: 'desk-fb-1',
          kind: 'get',
          origin: 'https://webauthn.io',
          rpId: 'webauthn.io',
          challengeBase64Url: challenge,
        },
      });
    });
    await act(async () => {
      await result.current.fallbackPasskeyToDevice();
    });
    expect(resolveExtensionPasskeyRequestMock).toHaveBeenCalledWith('desk-fb-1', {
      status: 'fallback',
      fallback: true,
    });

    // Desktop cancel
    act(() => {
      eventHandler?.({
        payload: {
          requestId: 'desk-cancel-1',
          kind: 'create',
          origin: 'https://webauthn.io',
          rpId: 'webauthn.io',
          challengeBase64Url: challenge,
        },
      });
    });
    await act(async () => {
      await result.current.cancelPasskeyRequest();
    });
    expect(resolveExtensionPasskeyRequestMock).toHaveBeenCalledWith('desk-cancel-1', {
      status: 'cancelled',
      fallback: false,
    });

    // Error handling when create fails (spoofed origin)
    act(() => {
      eventHandler?.({
        payload: {
          requestId: 'desk-err-1',
          kind: 'create',
          origin: 'https://evil.com',
          rpId: 'webauthn.io',
          challengeBase64Url: challenge,
        },
      });
    });
    await act(async () => {
      await result.current.approvePasskeyCreate();
    });
    expect(result.current.passkeyRequestError).toBeTruthy();

    // Error handling when get fails (spoofed origin)
    act(() => {
      eventHandler?.({
        payload: {
          requestId: 'desk-err-2',
          kind: 'get',
          origin: 'https://evil.com',
          rpId: 'webauthn.io',
          challengeBase64Url: challenge,
        },
      });
    });
    await act(async () => {
      await result.current.approvePasskeyGet(created.record);
    });
    expect(result.current.passkeyRequestError).toBeTruthy();

    unmount();
    expect(unlistenMock).toHaveBeenCalledTimes(1);
  });
});
