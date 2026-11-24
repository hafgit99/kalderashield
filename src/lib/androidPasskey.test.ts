/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the Android 14+ Credential Manager WebView bridge.
 */

// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cancelAndroidPasskeyRequest,
  completeAndroidPasskeyRequest,
  getPendingAndroidPasskeyRequest,
  subscribeAndroidPasskeyRequestCleared,
  subscribeAndroidPasskeyRequests,
  type AndroidPasskeyRequest,
} from './androidPasskey';

const VALID_REQUEST: AndroidPasskeyRequest = {
  requestId: 'req-android-1',
  kind: 'get',
  source: 'android-credential-provider',
  createdAt: 1700000000000,
  origin: 'https://github.com',
  rpId: 'github.com',
  challengeBase64Url: 'Y2hhbGxlbmdlLTEyMzQ1Njc4OTA',
  allowCredentialIds: ['cred-1'],
  appPackage: 'com.android.chrome',
};

describe('androidPasskey bridge', () => {
  afterEach(() => {
    delete window.KalderaShieldAndroidPasskey;
    delete window.__KalderaShieldAndroidPasskey;
  });

  it('returns null / false safely when Android bridge is unavailable', () => {
    expect(getPendingAndroidPasskeyRequest()).toBeNull();
    expect(completeAndroidPasskeyRequest('req-1', '{}')).toBe(false);
    expect(cancelAndroidPasskeyRequest('req-1')).toBe(false);
  });

  it('parses valid pending requests and rejects malformed JSON or untrusted source payloads', () => {
    const getPendingRequest = vi.fn<() => string | null>();
    window.KalderaShieldAndroidPasskey = {
      isSupported: () => true,
      getPendingRequest,
      completePasskeyRequest: vi.fn(() => true),
      cancelPasskeyRequest: vi.fn(() => true),
      failPasskeyRequest: vi.fn(() => true),
    };

    getPendingRequest.mockReturnValueOnce(JSON.stringify(VALID_REQUEST));
    expect(getPendingAndroidPasskeyRequest()).toEqual(VALID_REQUEST);

    getPendingRequest.mockReturnValueOnce('{bad-json');
    expect(getPendingAndroidPasskeyRequest()).toBeNull();

    getPendingRequest.mockReturnValueOnce(
      JSON.stringify({ ...VALID_REQUEST, source: 'untrusted-source' }),
    );
    expect(getPendingAndroidPasskeyRequest()).toBeNull();

    getPendingRequest.mockReturnValueOnce(
      JSON.stringify({ ...VALID_REQUEST, challengeBase64Url: '' }),
    );
    expect(getPendingAndroidPasskeyRequest()).toBeNull();
  });

  it('dispatches validated requests and cleared notifications to subscribers and unsubscribes cleanly', () => {
    const onReq = vi.fn();
    const onCleared = vi.fn();
    const unsubReq = subscribeAndroidPasskeyRequests(onReq);
    const unsubCleared = subscribeAndroidPasskeyRequestCleared(onCleared);

    window.__KalderaShieldAndroidPasskey?.onRequest(VALID_REQUEST);
    expect(onReq).toHaveBeenCalledTimes(1);
    expect(onReq).toHaveBeenCalledWith(VALID_REQUEST);

    // Invalid payload is ignored
    window.__KalderaShieldAndroidPasskey?.onRequest({
      ...VALID_REQUEST,
      kind: 'invalid' as 'get',
    });
    expect(onReq).toHaveBeenCalledTimes(1);

    window.__KalderaShieldAndroidPasskey?.onRequestCleared?.('req-android-1');
    expect(onCleared).toHaveBeenCalledWith('req-android-1');

    unsubReq();
    unsubCleared();

    window.__KalderaShieldAndroidPasskey?.onRequest(VALID_REQUEST);
    window.__KalderaShieldAndroidPasskey?.onRequestCleared?.('req-android-2');
    expect(onReq).toHaveBeenCalledTimes(1);
    expect(onCleared).toHaveBeenCalledTimes(1);
  });

  it('forwards completion and cancellation calls to the native bridge', () => {
    const completePasskeyRequest = vi.fn(() => true);
    const cancelPasskeyRequest = vi.fn(() => true);
    window.KalderaShieldAndroidPasskey = {
      isSupported: () => true,
      getPendingRequest: () => null,
      completePasskeyRequest,
      cancelPasskeyRequest,
      failPasskeyRequest: vi.fn(() => true),
    };

    expect(completeAndroidPasskeyRequest('req-android-1', '{"id":"cred-1"}')).toBe(true);
    expect(completePasskeyRequest).toHaveBeenCalledWith('req-android-1', '{"id":"cred-1"}');

    expect(cancelAndroidPasskeyRequest('req-android-1')).toBe(true);
    expect(cancelPasskeyRequest).toHaveBeenCalledWith('req-android-1');
  });
});
