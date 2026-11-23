/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MAIN-world document_start WebAuthn interceptor for KalderaShield.
 *
 * Intercepts `navigator.credentials.create({ publicKey })` and
 * `navigator.credentials.get({ publicKey })` and routes requests through
 * KalderaShield's encrypted desktop vault. Whenever the vault is locked,
 * no passkey matches, the feature is toggled off, or the user chooses their
 * hardware/platform authenticator, the call falls back seamlessly to the
 * browser's native WebAuthn implementation.
 */

import {
  KS_WEBAUTHN_REQ_TYPE,
  KS_WEBAUTHN_RES_TYPE,
  base64UrlToArrayBuffer,
  bufferSourceToBase64Url,
} from './webauthn-bridge';

interface SerializedAttestationResponse {
  id: string;
  rawId: string;
  type: 'public-key';
  authenticatorAttachment: 'platform';
  response: {
    clientDataJSON: string;
    attestationObject: string;
    authenticatorData: string;
    publicKey: string;
    publicKeyAlgorithm: number;
    transports: string[];
  };
  clientExtensionResults?: Record<string, unknown>;
}

interface SerializedAssertionResponse {
  id: string;
  rawId: string;
  type: 'public-key';
  authenticatorAttachment: 'platform';
  response: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle: string | null;
  };
  clientExtensionResults?: Record<string, unknown>;
}

interface BridgeResult {
  status?: string;
  fallback?: boolean;
  error?: string;
  credential?: SerializedAttestationResponse | SerializedAssertionResponse;
}

const REQUEST_TIMEOUT_MS = 95_000;

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function buildAttestationCredential(serialized: SerializedAttestationResponse): PublicKeyCredential {
  const rawId = base64UrlToArrayBuffer(serialized.rawId);
  const clientDataJSON = base64UrlToArrayBuffer(serialized.response.clientDataJSON);
  const attestationObject = base64UrlToArrayBuffer(serialized.response.attestationObject);
  const authenticatorData = base64UrlToArrayBuffer(serialized.response.authenticatorData);
  const publicKey = base64UrlToArrayBuffer(serialized.response.publicKey);
  const transports = Array.isArray(serialized.response.transports)
    ? serialized.response.transports.slice()
    : ['internal'];
  const publicKeyAlgorithm = typeof serialized.response.publicKeyAlgorithm === 'number'
    ? serialized.response.publicKeyAlgorithm
    : -7;
  const extResults = serialized.clientExtensionResults ?? {};

  const responseProto = typeof AuthenticatorAttestationResponse !== 'undefined'
    ? AuthenticatorAttestationResponse.prototype
    : Object.prototype;
  const response = Object.create(responseProto);
  Object.defineProperties(response, {
    clientDataJSON: { value: clientDataJSON, enumerable: true },
    attestationObject: { value: attestationObject, enumerable: true },
    getAuthenticatorData: { value: () => authenticatorData.slice(0), enumerable: true },
    getPublicKey: { value: () => publicKey.slice(0), enumerable: true },
    getPublicKeyAlgorithm: { value: () => publicKeyAlgorithm, enumerable: true },
    getTransports: { value: () => transports.slice(), enumerable: true },
  });

  const credProto = typeof PublicKeyCredential !== 'undefined'
    ? PublicKeyCredential.prototype
    : Object.prototype;
  const credential = Object.create(credProto);
  Object.defineProperties(credential, {
    id: { value: serialized.id, enumerable: true },
    rawId: { value: rawId, enumerable: true },
    type: { value: 'public-key', enumerable: true },
    authenticatorAttachment: { value: serialized.authenticatorAttachment || 'platform', enumerable: true },
    response: { value: response, enumerable: true },
    getClientExtensionResults: { value: () => ({ ...extResults }), enumerable: true },
    toJSON: {
      value: () => ({
        id: serialized.id,
        rawId: serialized.rawId,
        type: 'public-key',
        authenticatorAttachment: serialized.authenticatorAttachment || 'platform',
        response: {
          clientDataJSON: serialized.response.clientDataJSON,
          attestationObject: serialized.response.attestationObject,
          authenticatorData: serialized.response.authenticatorData,
          publicKey: serialized.response.publicKey,
          publicKeyAlgorithm,
          transports: transports.slice(),
        },
        clientExtensionResults: { ...extResults },
      }),
      enumerable: true,
    },
  });

  return credential as PublicKeyCredential;
}

function buildAssertionCredential(serialized: SerializedAssertionResponse): PublicKeyCredential {
  const rawId = base64UrlToArrayBuffer(serialized.rawId);
  const clientDataJSON = base64UrlToArrayBuffer(serialized.response.clientDataJSON);
  const authenticatorData = base64UrlToArrayBuffer(serialized.response.authenticatorData);
  const signature = base64UrlToArrayBuffer(serialized.response.signature);
  const userHandle = serialized.response.userHandle
    ? base64UrlToArrayBuffer(serialized.response.userHandle)
    : null;
  const extResults = serialized.clientExtensionResults ?? {};

  const responseProto = typeof AuthenticatorAssertionResponse !== 'undefined'
    ? AuthenticatorAssertionResponse.prototype
    : Object.prototype;
  const response = Object.create(responseProto);
  Object.defineProperties(response, {
    clientDataJSON: { value: clientDataJSON, enumerable: true },
    authenticatorData: { value: authenticatorData, enumerable: true },
    signature: { value: signature, enumerable: true },
    userHandle: { value: userHandle, enumerable: true },
  });

  const credProto = typeof PublicKeyCredential !== 'undefined'
    ? PublicKeyCredential.prototype
    : Object.prototype;
  const credential = Object.create(credProto);
  Object.defineProperties(credential, {
    id: { value: serialized.id, enumerable: true },
    rawId: { value: rawId, enumerable: true },
    type: { value: 'public-key', enumerable: true },
    authenticatorAttachment: { value: serialized.authenticatorAttachment || 'platform', enumerable: true },
    response: { value: response, enumerable: true },
    getClientExtensionResults: { value: () => ({ ...extResults }), enumerable: true },
    toJSON: {
      value: () => ({
        id: serialized.id,
        rawId: serialized.rawId,
        type: 'public-key',
        authenticatorAttachment: serialized.authenticatorAttachment || 'platform',
        response: {
          clientDataJSON: serialized.response.clientDataJSON,
          authenticatorData: serialized.response.authenticatorData,
          signature: serialized.response.signature,
          userHandle: serialized.response.userHandle,
        },
        clientExtensionResults: { ...extResults },
      }),
      enumerable: true,
    },
  });

  return credential as PublicKeyCredential;
}

function sendBridgeRequest(
  action: 'passkey_create' | 'passkey_get',
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<BridgeResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }

    const requestId = generateRequestId();
    let settled = false;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
      clearTimeout(timer);
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type !== KS_WEBAUTHN_RES_TYPE || data.requestId !== requestId) return;
      if (settled) return;
      settled = true;
      cleanup();
      resolve((data.response as BridgeResult) ?? { fallback: true });
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ status: 'timeout', fallback: true });
    }, REQUEST_TIMEOUT_MS);

    window.addEventListener('message', onMessage);
    signal?.addEventListener('abort', onAbort, { once: true });

    const targetOrigin = window.location?.origin && window.location.origin !== 'null'
      ? window.location.origin
      : '*';

    window.postMessage(
      {
        type: KS_WEBAUTHN_REQ_TYPE,
        requestId,
        action,
        payload,
      },
      targetOrigin,
    );
  });
}

export function installKalderaShieldWebAuthnInterceptor(targetWindow: Window = window): boolean {
  const nav = targetWindow.navigator;
  if (!nav || !nav.credentials) return false;
  const creds = nav.credentials as CredentialsContainer & { __kalderaShieldHooked?: boolean };
  if (creds.__kalderaShieldHooked) return true;
  if (typeof creds.create !== 'function' || typeof creds.get !== 'function') return false;

  const nativeCreate = creds.create.bind(creds);
  const nativeGet = creds.get.bind(creds);

  const patchedCreate: CredentialsContainer['create'] = async function (
    options?: CredentialCreationOptions,
  ): Promise<Credential | null> {
    if (!options || !options.publicKey) {
      return nativeCreate(options);
    }

    const pk = options.publicKey;
    const payload: Record<string, unknown> = {
      rpId: pk.rp?.id ?? '',
      rpName: pk.rp?.name ?? '',
      userName: pk.user?.name ?? '',
      userDisplayName: pk.user?.displayName ?? pk.user?.name ?? '',
      userIdBase64Url: pk.user?.id ? bufferSourceToBase64Url(pk.user.id) : '',
      challengeBase64Url: bufferSourceToBase64Url(pk.challenge),
      pubKeyCredAlgs: Array.isArray(pk.pubKeyCredParams)
        ? pk.pubKeyCredParams.map((p) => p.alg)
        : [-7],
      excludeCredentialIds: Array.isArray(pk.excludeCredentials)
        ? pk.excludeCredentials.map((c) => bufferSourceToBase64Url(c.id))
        : [],
      crossOrigin: targetWindow.top !== targetWindow.self,
    };

    const result = await sendBridgeRequest('passkey_create', payload, options.signal);
    if (result.status === 'ok' && result.credential) {
      return buildAttestationCredential(result.credential as SerializedAttestationResponse);
    }
    if (result.status === 'cancelled' && result.fallback === false) {
      throw new DOMException('The operation was cancelled by the user.', 'NotAllowedError');
    }
    return nativeCreate(options);
  };

  const patchedGet: CredentialsContainer['get'] = async function (
    options?: CredentialRequestOptions,
  ): Promise<Credential | null> {
    if (!options || !options.publicKey) {
      return nativeGet(options);
    }
    // Preserve native conditional mediation (inline browser autofill UI)
    if (options.mediation === 'conditional') {
      return nativeGet(options);
    }

    const pk = options.publicKey;
    const payload: Record<string, unknown> = {
      rpId: pk.rpId ?? '',
      challengeBase64Url: bufferSourceToBase64Url(pk.challenge),
      allowCredentialIds: Array.isArray(pk.allowCredentials)
        ? pk.allowCredentials.map((c) => bufferSourceToBase64Url(c.id))
        : [],
      crossOrigin: targetWindow.top !== targetWindow.self,
    };

    const result = await sendBridgeRequest('passkey_get', payload, options.signal);
    if (result.status === 'ok' && result.credential) {
      return buildAssertionCredential(result.credential as SerializedAssertionResponse);
    }
    if (result.status === 'cancelled' && result.fallback === false) {
      throw new DOMException('The operation was cancelled by the user.', 'NotAllowedError');
    }
    return nativeGet(options);
  };

  try {
    Object.defineProperty(creds, 'create', {
      value: patchedCreate,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(creds, 'get', {
      value: patchedGet,
      configurable: true,
      writable: true,
    });
    creds.__kalderaShieldHooked = true;
    return true;
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined' && window.isSecureContext) {
  installKalderaShieldWebAuthnInterceptor(window);
}
