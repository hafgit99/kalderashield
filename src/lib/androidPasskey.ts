/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * TypeScript bridge for Android 14+ Credential Manager passkey requests exposed
 * by `AndroidPasskeyBridge` (`window.KalderaShieldAndroidPasskey`) in MainActivity.
 */

export interface AndroidPasskeyRequest {
  requestId: string;
  kind: 'create' | 'get';
  source: 'android-credential-provider';
  createdAt: number;
  origin: string;
  rpId: string;
  rpName?: string;
  userName?: string;
  userDisplayName?: string;
  userIdBase64Url?: string;
  challengeBase64Url: string;
  pubKeyCredAlgs?: number[];
  excludeCredentialIds?: string[];
  allowCredentialIds?: string[];
  appPackage?: string;
  crossOrigin?: boolean;
}

declare global {
  interface Window {
    KalderaShieldAndroidPasskey?: {
      isSupported(): boolean;
      getPendingRequest(): string | null;
      completePasskeyRequest(requestId: string, responseJson: string): boolean;
      cancelPasskeyRequest(requestId: string): boolean;
      failPasskeyRequest(requestId: string, errorMessage: string): boolean;
    };
    __KalderaShieldAndroidPasskey?: {
      onRequest(request: AndroidPasskeyRequest | null): void;
      onRequestCleared?(requestId: string): void;
    };
  }
}

type PasskeyRequestListener = (request: AndroidPasskeyRequest) => void;
type PasskeyClearedListener = (requestId: string) => void;

const requestListeners = new Set<PasskeyRequestListener>();
const clearedListeners = new Set<PasskeyClearedListener>();

function bridge(): NonNullable<Window['KalderaShieldAndroidPasskey']> | null {
  if (typeof window === 'undefined') return null;
  return window.KalderaShieldAndroidPasskey ?? null;
}

function isAndroidPasskeyRequest(value: unknown): value is AndroidPasskeyRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AndroidPasskeyRequest>;
  return (
    typeof candidate.requestId === 'string'
    && candidate.requestId.length > 0
    && (candidate.kind === 'create' || candidate.kind === 'get')
    && candidate.source === 'android-credential-provider'
    && typeof candidate.origin === 'string'
    && candidate.origin.length > 0
    && typeof candidate.rpId === 'string'
    && candidate.rpId.length > 0
    && typeof candidate.challengeBase64Url === 'string'
    && candidate.challengeBase64Url.length > 0
  );
}

function ensureGlobalReceiverInstalled(): void {
  if (typeof window === 'undefined') return;
  if (!window.__KalderaShieldAndroidPasskey) {
    window.__KalderaShieldAndroidPasskey = {
      onRequest(request: AndroidPasskeyRequest | null) {
        if (!isAndroidPasskeyRequest(request)) return;
        for (const listener of requestListeners) {
          listener(request);
        }
      },
      onRequestCleared(requestId: string) {
        if (typeof requestId !== 'string' || !requestId) return;
        for (const listener of clearedListeners) {
          listener(requestId);
        }
      },
    };
  }
}

export function getPendingAndroidPasskeyRequest(): AndroidPasskeyRequest | null {
  try {
    const raw = bridge()?.getPendingRequest();
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isAndroidPasskeyRequest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function subscribeAndroidPasskeyRequests(listener: PasskeyRequestListener): () => void {
  ensureGlobalReceiverInstalled();
  requestListeners.add(listener);
  return () => {
    requestListeners.delete(listener);
  };
}

export function subscribeAndroidPasskeyRequestCleared(listener: PasskeyClearedListener): () => void {
  ensureGlobalReceiverInstalled();
  clearedListeners.add(listener);
  return () => {
    clearedListeners.delete(listener);
  };
}

export function completeAndroidPasskeyRequest(requestId: string, responseJson: string): boolean {
  try {
    return bridge()?.completePasskeyRequest(requestId, responseJson) === true;
  } catch {
    return false;
  }
}

export function cancelAndroidPasskeyRequest(requestId: string): boolean {
  try {
    return bridge()?.cancelPasskeyRequest(requestId) === true;
  } catch {
    return false;
  }
}
