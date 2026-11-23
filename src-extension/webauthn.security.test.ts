/**
 * @vitest-environment jsdom
 * @vitest-environment-options { "url": "https://github.com/" }
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KS_WEBAUTHN_REQ_TYPE,
  KS_WEBAUTHN_RES_TYPE,
  validateExtensionPasskeyOriginAndRpId,
} from './webauthn-bridge';
import { installKalderaShieldWebAuthnInterceptor } from './webauthn-inject';

describe('extension WebAuthn origin & RP ID security boundaries', () => {
  it('accepts HTTPS origins, valid subdomains, and localhost', () => {
    expect(validateExtensionPasskeyOriginAndRpId('https://github.com/login', 'github.com')).toEqual({
      origin: 'https://github.com',
      rpId: 'github.com',
      hostname: 'github.com',
    });
    expect(validateExtensionPasskeyOriginAndRpId('https://accounts.google.com/v3', 'google.com')).toEqual({
      origin: 'https://accounts.google.com',
      rpId: 'google.com',
      hostname: 'accounts.google.com',
    });
    expect(validateExtensionPasskeyOriginAndRpId('http://localhost:3000/app', 'localhost')).toEqual({
      origin: 'http://localhost:3000',
      rpId: 'localhost',
      hostname: 'localhost',
    });
  });

  it.each([
    ['http://github.com/login', 'github.com'],
    ['https://evil.com/phish', 'github.com'],
    ['https://github.com.evil.com', 'github.com'],
    ['https://example.co.uk', 'co.uk'],
    ['https://example.com', 'com'],
    ['https://127.0.0.1:8443', '127.0.0.1'],
    ['file:///C:/test.html', 'localhost'],
    ['chrome-extension://abcdef/popup.html', 'abcdef'],
  ])('rejects spoofed, insecure, or public-suffix RP ID (%s -> %s)', (tabUrl, rpId) => {
    expect(validateExtensionPasskeyOriginAndRpId(tabUrl, rpId)).toBeNull();
  });
});

describe('extension MAIN-world WebAuthn interceptor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (navigator as { credentials?: unknown }).credentials;
  });

  function setupStubCredentials() {
    const nativeCreate = vi.fn(async () => ({ id: 'native-created', type: 'public-key' }) as unknown as Credential);
    const nativeGet = vi.fn(async () => ({ id: 'native-asserted', type: 'public-key' }) as unknown as Credential);
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: { create: nativeCreate, get: nativeGet },
    });
    expect(installKalderaShieldWebAuthnInterceptor(window)).toBe(true);
    return { nativeCreate, nativeGet };
  }

  function mockRelay(responder: (action: string, payload: Record<string, unknown>) => Record<string, unknown>) {
    vi.spyOn(window, 'postMessage').mockImplementation(((message: unknown, targetOrigin?: string | WindowPostMessageOptions) => {
      const originStr = typeof targetOrigin === 'string' ? targetOrigin : targetOrigin?.targetOrigin;
      expect(originStr).toBe(window.location.origin);
      const data = message as { type?: string; requestId?: string; action?: string; payload?: Record<string, unknown> };
      if (data?.type !== KS_WEBAUTHN_REQ_TYPE || !data.action || !data.payload) return;
      const resp = responder(data.action, data.payload);
      queueMicrotask(() => {
        // First dispatch a cross-origin spoofed response that must be ignored
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: KS_WEBAUTHN_RES_TYPE, requestId: data.requestId, response: { status: 'cancelled', fallback: false } },
            source: window,
            origin: 'https://evil.example',
          }),
        );
        // Then dispatch the genuine same-origin response
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: KS_WEBAUTHN_RES_TYPE, requestId: data.requestId, response: resp },
            source: window,
            origin: window.location.origin,
          }),
        );
      });
    }) as typeof window.postMessage);
  }

  it('returns a WebAuthn PublicKeyCredential when KalderaShield approves create()', async () => {
    const { nativeCreate } = setupStubCredentials();
    mockRelay((action) => {
      expect(action).toBe('passkey_create');
      return {
        status: 'ok',
        credential: {
          id: 'Y3JlZC0x',
          rawId: 'Y3JlZC0x',
          type: 'public-key',
          authenticatorAttachment: 'platform',
          response: {
            clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIn0',
            attestationObject: 'o2NmbXRobm9uZQ',
            authenticatorData: 'AQIDBA',
            publicKey: 'BQYHCA',
            publicKeyAlgorithm: -7,
            transports: ['internal', 'hybrid'],
          },
          clientExtensionResults: {},
        },
      };
    });

    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: new Uint8Array([1, 2, 3, 4]),
        rp: { id: 'github.com', name: 'GitHub' },
        user: { id: new Uint8Array([9, 9]), name: 'alice', displayName: 'Alice' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      },
    }) as PublicKeyCredential;

    expect(nativeCreate).not.toHaveBeenCalled();
    expect(cred.id).toBe('Y3JlZC0x');
    expect(cred.type).toBe('public-key');
    expect(new Uint8Array(cred.rawId).length).toBeGreaterThan(0);
    const resp = cred.response as AuthenticatorAttestationResponse;
    expect(resp.getPublicKeyAlgorithm()).toBe(-7);
    expect(resp.getTransports()).toEqual(['internal', 'hybrid']);
  });

  it('falls back seamlessly to native browser WebAuthn when KalderaShield returns fallback: true', async () => {
    const { nativeGet } = setupStubCredentials();
    mockRelay(() => ({ status: 'no_match', fallback: true }));

    const cred = await navigator.credentials.get({
      publicKey: {
        challenge: new Uint8Array([5, 6, 7]),
        rpId: 'github.com',
      },
    });

    expect(nativeGet).toHaveBeenCalledTimes(1);
    expect(cred?.id).toBe('native-asserted');
  });

  it('throws NotAllowedError when the user explicitly cancels on desktop', async () => {
    const { nativeCreate } = setupStubCredentials();
    mockRelay(() => ({ status: 'cancelled', fallback: false }));

    await expect(
      navigator.credentials.create({
        publicKey: {
          challenge: new Uint8Array([1, 2, 3]),
          rp: { id: 'github.com', name: 'GitHub' },
          user: { id: new Uint8Array([1]), name: 'alice', displayName: 'Alice' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        },
      }),
    ).rejects.toMatchObject({ name: 'NotAllowedError' });

    expect(nativeCreate).not.toHaveBeenCalled();
  });

  it('passes conditional mediation directly through to native browser WebAuthn', async () => {
    const { nativeGet } = setupStubCredentials();
    const relaySpy = vi.fn(() => ({ status: 'ok' }));
    mockRelay(relaySpy);

    const cred = await navigator.credentials.get({
      mediation: 'conditional',
      publicKey: {
        challenge: new Uint8Array([7, 8]),
        rpId: 'github.com',
      },
    });

    expect(relaySpy).not.toHaveBeenCalled();
    expect(nativeGet).toHaveBeenCalledTimes(1);
    expect(cred?.id).toBe('native-asserted');
  });
});
