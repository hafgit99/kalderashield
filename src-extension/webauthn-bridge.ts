/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared WebAuthn Passkey Provider bridge helpers for the KalderaShield browser
 * extension (used by background service worker, MAIN-world injector, and tests).
 */

import { extractRegistrableDomain, extractRegistrableDomainFromUrl } from './psl-utils';

export const KS_WEBAUTHN_REQ_TYPE = 'KALDERASHIELD_WEBAUTHN_REQUEST_V1';
export const KS_WEBAUTHN_RES_TYPE = 'KALDERASHIELD_WEBAUTHN_RESPONSE_V1';

export interface ValidatedPasskeyOrigin {
  origin: string;
  rpId: string;
  hostname: string;
}

function isIpLiteral(host: string): boolean {
  if (host.includes(':')) return true;
  return host.split('.').every((part) => part.length > 0 && /^\d+$/.test(part));
}

/**
 * Authoritatively validates a tab URL (`sender.tab.url` or `sender.url`) and
 * optional `rpId` per W3C WebAuthn §5.1 / §5.4 and the Public Suffix List.
 * Never trusts any origin string provided by page JavaScript.
 */
export function validateExtensionPasskeyOriginAndRpId(
  tabUrl: string | undefined,
  requestedRpId?: string,
): ValidatedPasskeyOrigin | null {
  if (!tabUrl || typeof tabUrl !== 'string') return null;

  let parsed: URL;
  try {
    parsed = new URL(tabUrl);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const isHttps = parsed.protocol === 'https:';
  const isLocalhostHttp =
    parsed.protocol === 'http:' && (hostname === 'localhost' || hostname.endsWith('.localhost'));
  if (!isHttps && !isLocalhostHttp) return null;
  if (!hostname || hostname.length > 253 || isIpLiteral(hostname)) return null;

  const rpId = (requestedRpId && typeof requestedRpId === 'string' && requestedRpId.trim()
    ? requestedRpId.trim()
    : hostname
  ).toLowerCase();

  if (!rpId || rpId.length > 253) return null;
  if (rpId.startsWith('.') || rpId.endsWith('.') || rpId.includes('..')) return null;
  if (!/^[a-z0-9.-]+$/.test(rpId)) return null;
  if (isIpLiteral(rpId)) return null;

  // rpId must equal hostname or be a strict domain suffix of hostname
  if (hostname !== rpId && !hostname.endsWith(`.${rpId}`)) {
    return null;
  }

  // Enforce PSL registrable-domain floor so bare public suffixes ("com", "co.uk") are rejected
  if (rpId !== 'localhost' && !rpId.endsWith('.localhost')) {
    const tabEtldPlusOne = extractRegistrableDomainFromUrl(tabUrl);
    const rpEtldPlusOne = extractRegistrableDomain(rpId);
    if (!tabEtldPlusOne || !rpEtldPlusOne || tabEtldPlusOne !== rpEtldPlusOne) {
      return null;
    }
    // Reject if rpId is shorter than the registrable domain (i.e. a bare public suffix)
    if (rpId.length < tabEtldPlusOne.length) {
      return null;
    }
    const labels = rpId.split('.');
    if (labels.length < 2) return null;
    if (labels.some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) {
      return null;
    }
  }

  return {
    origin: parsed.origin,
    rpId,
    hostname,
  };
}

export function bufferSourceToBase64Url(source: BufferSource): string {
  const bytes = source instanceof ArrayBuffer
    ? new Uint8Array(source)
    : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
