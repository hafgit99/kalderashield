/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Vault-backed software WebAuthn Passkey Provider (Phase 1 / Option B).
 *
 * Generates real ECDSA P-256 (ES256 / COSE -7) key pairs inside KalderaShield,
 * wraps private keys with the active vault encryption key (HKDF-SHA-256 +
 * AES-256-GCM) so they never leave the desktop vault in plaintext, and produces
 * W3C WebAuthn Level 2/3 compliant `create` (attestationObject) and `get`
 * (DER-signed assertion) payloads for the browser extension bridge.
 */

import type { VaultItem } from '../types';
import { secureRandomBytes, secureRandomId } from './random';
import { withActiveVaultEncryptionKey } from './vaultSession';
import { base64UrlToBytes, bytesToBase64Url } from './passkeyAssertion';
import {
  encodeCoseP256PublicKey,
  encodeNoneAttestationObject,
  rawEcdsaToDer,
} from './passkeyCbor';
import {
  PasskeyError,
  passkeyErrorCodes,
  unwrapPrivateKeyJwk,
  vaultFieldsToRecord,
  wrapPrivateKeyJwk,
  type PasskeyRecord,
} from './passkey';

/**
 * Deterministic 16-byte AAGUID identifying KalderaShield's vault-backed passkey
 * provider (`4b616c64-6572-4153-8869-656c64506173`, RFC 4122 v4/variant 10 bits).
 */
export const KALDERASHIELD_PASSKEY_AAGUID = new Uint8Array([
  0x4b, 0x61, 0x6c, 0x64,
  0x65, 0x72,
  0x41, 0x53,
  0x88, 0x69,
  0x65, 0x6c, 0x64, 0x50, 0x61, 0x73,
]);

const COSE_ALG_ES256 = -7;

/** WebAuthn authenticatorData flags (§6.1): UP | UV | BE | BS */
const FLAG_UP = 0x01;
const FLAG_UV = 0x04;
const FLAG_BE = 0x08;
const FLAG_BS = 0x10;
const FLAG_AT = 0x40;

const CREATE_FLAGS = FLAG_UP | FLAG_UV | FLAG_BE | FLAG_BS | FLAG_AT; // 0x5d
const GET_FLAGS = FLAG_UP | FLAG_UV | FLAG_BE | FLAG_BS;              // 0x1d

export interface ExtensionPasskeyCreateRequest {
  requestId?: string;
  origin: string;
  rpId?: string;
  rpName?: string;
  userName: string;
  userDisplayName?: string;
  userIdBase64Url?: string;
  challengeBase64Url: string;
  pubKeyCredAlgs?: number[];
  excludeCredentialIds?: string[];
  crossOrigin?: boolean;
}

export interface SerializedAttestationCredential {
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
  clientExtensionResults: Record<string, unknown>;
}

export interface CreateSoftwarePasskeyResult {
  record: PasskeyRecord;
  credential: SerializedAttestationCredential;
}

export interface ExtensionPasskeyGetRequest {
  requestId?: string;
  origin: string;
  rpId?: string;
  challengeBase64Url: string;
  allowCredentialIds?: string[];
  crossOrigin?: boolean;
}

export interface SerializedAssertionCredential {
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
  clientExtensionResults: Record<string, unknown>;
}

export interface SignSoftwarePasskeyResult {
  updatedRecord: PasskeyRecord;
  credential: SerializedAssertionCredential;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return new Uint8Array(digest);
}

function isIpLiteral(host: string): boolean {
  if (host.includes(':')) return true; // IPv6 literal
  return host.split('.').every((part) => /^\d+$/.test(part));
}

function isValidHostLabelSequence(host: string): boolean {
  if (!host || host.length > 253) return false;
  if (host === 'localhost') return true;
  if (!/^[a-z0-9.-]+$/.test(host)) return false;
  if (host.startsWith('.') || host.endsWith('.') || host.includes('..')) return false;
  const labels = host.split('.');
  if (labels.length < 2) return false;
  if (isIpLiteral(host)) return false;
  for (const label of labels) {
    if (!label || label.length > 63) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
  }
  return true;
}

/**
 * Validates that `origin` is a WebAuthn-eligible secure origin (`https://` or
 * `http://localhost`) and that `rpId` is a valid registrable domain suffix of
 * the origin's hostname. Returns the normalized lowercase `rpId` and canonical `origin`.
 */
export function validateOriginAndRpId(
  origin: string,
  requestedRpId?: string,
): { origin: string; rpId: string; hostname: string } {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new PasskeyError(passkeyErrorCodes.rpIdOriginMismatch);
  }

  const hostname = parsed.hostname.toLowerCase();
  const isHttps = parsed.protocol === 'https:';
  const isLocalhostHttp = parsed.protocol === 'http:' && (hostname === 'localhost' || hostname.endsWith('.localhost'));
  if (!isHttps && !isLocalhostHttp) {
    throw new PasskeyError(passkeyErrorCodes.rpIdOriginMismatch);
  }
  if (isIpLiteral(hostname)) {
    throw new PasskeyError(passkeyErrorCodes.rpIdOriginMismatch);
  }

  const rpId = (requestedRpId && requestedRpId.trim() ? requestedRpId.trim() : hostname).toLowerCase();
  if (!isValidHostLabelSequence(rpId)) {
    throw new PasskeyError(passkeyErrorCodes.missingRpId);
  }
  if (hostname !== rpId && !hostname.endsWith(`.${rpId}`)) {
    throw new PasskeyError(passkeyErrorCodes.rpIdOriginMismatch);
  }

  return { origin: parsed.origin, rpId, hostname };
}

function padTo32Bytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length === 32) return bytes;
  if (bytes.length > 32) {
    throw new PasskeyError(passkeyErrorCodes.invalidJwk);
  }
  const padded = new Uint8Array(32);
  padded.set(bytes, 32 - bytes.length);
  return padded;
}

function buildAuthenticatorData(
  rpIdHash: Uint8Array,
  flags: number,
  signCount: number,
  attestedCredentialData?: Uint8Array,
): Uint8Array {
  const extraLen = attestedCredentialData ? attestedCredentialData.length : 0;
  const authData = new Uint8Array(37 + extraLen);
  authData.set(rpIdHash, 0);
  authData[32] = flags;
  new DataView(authData.buffer).setUint32(33, signCount >>> 0, false);
  if (attestedCredentialData) {
    authData.set(attestedCredentialData, 37);
  }
  return authData;
}

function buildClientDataJson(
  type: 'webauthn.create' | 'webauthn.get',
  challengeBase64Url: string,
  origin: string,
  crossOrigin = false,
): Uint8Array {
  const payload = JSON.stringify({
    type,
    challenge: challengeBase64Url,
    origin,
    crossOrigin: Boolean(crossOrigin),
  });
  return new TextEncoder().encode(payload);
}

/**
 * Returns vault passkey records eligible for software assertion signing for the
 * given Relying Party and optional `allowCredentials` filter.
 */
export function findMatchingSoftwarePasskeys(
  items: VaultItem[],
  rpId: string,
  allowCredentialIds?: string[],
): PasskeyRecord[] {
  const normalizedRpId = rpId.trim().toLowerCase();
  const allowSet = allowCredentialIds && allowCredentialIds.length > 0
    ? new Set(allowCredentialIds)
    : null;

  const matches: PasskeyRecord[] = [];
  for (const item of items) {
    if (item.deleted || item.category !== 'passkey') continue;
    const record = vaultFieldsToRecord(item.id, item);
    if (!record) continue;
    if (record.providerKind !== 'software') continue;
    if (record.rpId.toLowerCase() !== normalizedRpId) continue;
    if (allowSet && !allowSet.has(record.credentialId)) continue;
    matches.push(record);
  }
  return matches;
}

/**
 * Creates a real ECDSA P-256 passkey inside the active KalderaShield vault and
 * returns both the vault record and the W3C WebAuthn attestation response.
 */
export async function createSoftwarePasskey(
  request: ExtensionPasskeyCreateRequest,
  existingItems: VaultItem[] = [],
): Promise<CreateSoftwarePasskeyResult> {
  const { origin, rpId } = validateOriginAndRpId(request.origin, request.rpId);

  const userName = (request.userName || '').trim();
  if (!userName || userName.length > 320) {
    throw new PasskeyError(passkeyErrorCodes.missingUserName);
  }
  if (!request.challengeBase64Url || typeof request.challengeBase64Url !== 'string') {
    throw new PasskeyError(passkeyErrorCodes.createFailed);
  }

  // Require ES256 (-7) support when caller specifies pubKeyCredParams
  if (Array.isArray(request.pubKeyCredAlgs) && request.pubKeyCredAlgs.length > 0
    && !request.pubKeyCredAlgs.includes(COSE_ALG_ES256)) {
    throw new PasskeyError(passkeyErrorCodes.unsupportedAlgorithm);
  }

  // WebAuthn excludeCredentials check: refuse duplicate credential on same RP
  if (Array.isArray(request.excludeCredentialIds) && request.excludeCredentialIds.length > 0) {
    const excluded = findMatchingSoftwarePasskeys(existingItems, rpId, request.excludeCredentialIds);
    if (excluded.length > 0) {
      throw new PasskeyError(passkeyErrorCodes.invalidCredentialId);
    }
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );

  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const spkiBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const spkiBytes = new Uint8Array(spkiBuffer);

  if (!privateJwk.x || !privateJwk.y || !privateJwk.d) {
    throw new PasskeyError(passkeyErrorCodes.invalidJwk);
  }
  const xBytes = padTo32Bytes(base64UrlToBytes(privateJwk.x));
  const yBytes = padTo32Bytes(base64UrlToBytes(privateJwk.y));
  const cosePublicKey = encodeCoseP256PublicKey(xBytes, yBytes);

  const credentialIdBytes = secureRandomBytes(16);
  const credentialId = bytesToBase64Url(credentialIdBytes);
  const userHandle = request.userIdBase64Url && request.userIdBase64Url.trim()
    ? request.userIdBase64Url.trim()
    : bytesToBase64Url(secureRandomBytes(16));

  const wrappedPrivateKey = await withActiveVaultEncryptionKey(async (vaultKey) => {
    if (!vaultKey) throw new PasskeyError(passkeyErrorCodes.sessionMissing);
    return wrapPrivateKeyJwk(privateJwk, vaultKey);
  });
  if (!wrappedPrivateKey) {
    throw new PasskeyError(passkeyErrorCodes.sessionMissing);
  }

  const rpIdHash = await sha256(new TextEncoder().encode(rpId));
  const attestedData = new Uint8Array(16 + 2 + credentialIdBytes.length + cosePublicKey.length);
  attestedData.set(KALDERASHIELD_PASSKEY_AAGUID, 0);
  new DataView(attestedData.buffer).setUint16(16, credentialIdBytes.length, false);
  attestedData.set(credentialIdBytes, 18);
  attestedData.set(cosePublicKey, 18 + credentialIdBytes.length);

  const authenticatorData = buildAuthenticatorData(rpIdHash, CREATE_FLAGS, 0, attestedData);
  const attestationObject = encodeNoneAttestationObject(authenticatorData);
  const clientDataBytes = buildClientDataJson(
    'webauthn.create',
    request.challengeBase64Url,
    origin,
    request.crossOrigin,
  );

  const transports = ['internal', 'hybrid'];
  const rpName = (request.rpName || '').trim() || rpId;
  const record: PasskeyRecord = {
    itemId: secureRandomId(),
    credentialId,
    publicKey: bytesToBase64Url(spkiBytes),
    privateKeyBundle: wrappedPrivateKey,
    rpId,
    rpName,
    userName,
    userHandle,
    signCount: 0,
    algorithm: 'ES256',
    createdAt: new Date().toISOString(),
    transports,
    attachment: 'platform',
    providerKind: 'software',
  };

  return {
    record,
    credential: {
      id: credentialId,
      rawId: credentialId,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: {
        clientDataJSON: bytesToBase64Url(clientDataBytes),
        attestationObject: bytesToBase64Url(attestationObject),
        authenticatorData: bytesToBase64Url(authenticatorData),
        publicKey: bytesToBase64Url(spkiBytes),
        publicKeyAlgorithm: COSE_ALG_ES256,
        transports,
      },
      clientExtensionResults: {},
    },
  };
}

/**
 * Produces a W3C WebAuthn assertion signed with the vault-stored ECDSA P-256
 * private key for the requested Relying Party and challenge.
 */
export async function signSoftwarePasskeyAssertion(
  record: PasskeyRecord,
  request: ExtensionPasskeyGetRequest,
): Promise<SignSoftwarePasskeyResult> {
  if (record.providerKind !== 'software') {
    throw new PasskeyError(passkeyErrorCodes.unsupportedAlgorithm);
  }
  const { origin, rpId } = validateOriginAndRpId(request.origin, request.rpId || record.rpId);
  if (rpId !== record.rpId.toLowerCase()) {
    throw new PasskeyError(passkeyErrorCodes.rpIdOriginMismatch);
  }
  if (!request.challengeBase64Url || typeof request.challengeBase64Url !== 'string') {
    throw new PasskeyError(passkeyErrorCodes.createFailed);
  }
  if (Array.isArray(request.allowCredentialIds) && request.allowCredentialIds.length > 0
    && !request.allowCredentialIds.includes(record.credentialId)) {
    throw new PasskeyError(passkeyErrorCodes.invalidCredentialId);
  }

  const privateJwk = await withActiveVaultEncryptionKey(async (vaultKey) => {
    if (!vaultKey) throw new PasskeyError(passkeyErrorCodes.sessionMissing);
    return unwrapPrivateKeyJwk(record.privateKeyBundle, vaultKey);
  });
  if (!privateJwk) {
    throw new PasskeyError(passkeyErrorCodes.sessionMissing);
  }
  if (privateJwk.kty !== 'EC' || privateJwk.crv !== 'P-256' || !privateJwk.d) {
    throw new PasskeyError(passkeyErrorCodes.invalidJwk);
  }

  const signingKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: privateJwk.kty,
      crv: privateJwk.crv,
      x: privateJwk.x,
      y: privateJwk.y,
      d: privateJwk.d,
      ext: false,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const nextSignCount = (record.signCount || 0) + 1;
  const rpIdHash = await sha256(new TextEncoder().encode(rpId));
  const authenticatorData = buildAuthenticatorData(rpIdHash, GET_FLAGS, nextSignCount);
  const clientDataBytes = buildClientDataJson(
    'webauthn.get',
    request.challengeBase64Url,
    origin,
    request.crossOrigin,
  );
  const clientDataHash = await sha256(clientDataBytes);

  const signedPayload = new Uint8Array(authenticatorData.length + clientDataHash.length);
  signedPayload.set(authenticatorData, 0);
  signedPayload.set(clientDataHash, authenticatorData.length);

  const rawSignature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      signingKey,
      signedPayload as unknown as BufferSource,
    ),
  );
  const derSignature = rawEcdsaToDer(rawSignature, 32);

  const updatedRecord: PasskeyRecord = {
    ...record,
    signCount: nextSignCount,
    lastUsedAt: new Date().toISOString(),
  };

  return {
    updatedRecord,
    credential: {
      id: record.credentialId,
      rawId: record.credentialId,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: {
        clientDataJSON: bytesToBase64Url(clientDataBytes),
        authenticatorData: bytesToBase64Url(authenticatorData),
        signature: bytesToBase64Url(derSignature),
        userHandle: record.userHandle ?? null,
      },
      clientExtensionResults: {},
    },
  };
}
