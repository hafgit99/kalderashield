/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ISOLATED-world document_start relay bridging WebAuthn requests from the
 * MAIN-world injector (`webauthn-inject.ts`) to the extension background
 * service worker (`background.ts`). Keeps zero secrets in content-script memory.
 */

import { KS_WEBAUTHN_REQ_TYPE, KS_WEBAUTHN_RES_TYPE } from './webauthn-bridge';

if (typeof window !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
  window.addEventListener('message', (event: MessageEvent) => {
    const expectedOrigin = window.location?.origin ?? '';
    if (!expectedOrigin || expectedOrigin === 'null') return;
    if (event.source !== window || event.origin !== expectedOrigin) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.type !== KS_WEBAUTHN_REQ_TYPE) return;

    const requestId = typeof data.requestId === 'string' ? data.requestId : '';
    const action = data.action === 'passkey_create' || data.action === 'passkey_get'
      ? data.action
      : null;
    if (!requestId || !action || !data.payload || typeof data.payload !== 'object') return;

    try {
      chrome.runtime.sendMessage(
        { action, payload: data.payload },
        (response) => {
          const runtimeError = chrome.runtime.lastError;
          window.postMessage(
            {
              type: KS_WEBAUTHN_RES_TYPE,
              requestId,
              response: runtimeError
                ? { status: 'host_unavailable', fallback: true, error: runtimeError.message }
                : (response ?? { status: 'no_response', fallback: true }),
            },
            expectedOrigin,
          );
        },
      );
    } catch {
      window.postMessage(
        {
          type: KS_WEBAUTHN_RES_TYPE,
          requestId,
          response: { status: 'relay_error', fallback: true },
        },
        expectedOrigin,
      );
    }
  });
}
