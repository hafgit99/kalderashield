/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure-TypeScript Google Authenticator `otpauth-migration://offline?data=...` decoder.
 *
 * Parses the Protobuf `MigrationPayload` wire format (zero external dependencies)
 * and extracts TOTP entries into standard `otpauth://totp/...` URIs.
 */

export interface MigratedOtpAccount {
  name: string;
  issuer: string;
  secretBase32: string;
  algorithm: 'SHA1' | 'SHA256' | 'SHA512';
  digits: 6 | 8;
  otpauthUri: string;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase64ToBytes(raw: string): Uint8Array {
  let normalized = raw.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  while (normalized.length % 4 !== 0) {
    normalized += '=';
  }
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function readVarint(bytes: Uint8Array, offset: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < bytes.length) {
    const byte = bytes[pos++]!;
    result += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) {
      return { value: result, next: pos };
    }
    shift += 7;
    if (shift > 56) throw new Error('Invalid protobuf varint');
  }
  throw new Error('Truncated protobuf varint');
}

function skipWireField(bytes: Uint8Array, pos: number, wireType: number): number {
  if (wireType === 0) return readVarint(bytes, pos).next;
  if (wireType === 1) return pos + 8;
  if (wireType === 2) {
    const { value: len, next } = readVarint(bytes, pos);
    return next + len;
  }
  if (wireType === 5) return pos + 4;
  throw new Error(`Unsupported protobuf wire type ${wireType}`);
}

function parseOtpParameters(bytes: Uint8Array): MigratedOtpAccount | null {
  let pos = 0;
  let secretBytes: Uint8Array | null = null;
  let name = '';
  let issuer = '';
  let algorithmEnum = 1; // SHA1
  let digitsEnum = 1; // 6
  let typeEnum = 2; // TOTP

  const decoder = new TextDecoder();

  while (pos < bytes.length) {
    const { value: tag, next } = readVarint(bytes, pos);
    pos = next;
    const fieldNumber = tag >>> 3;
    const wireType = tag & 7;

    if (fieldNumber === 1 && wireType === 2) {
      const { value: len, next: dataStart } = readVarint(bytes, pos);
      secretBytes = bytes.slice(dataStart, dataStart + len);
      pos = dataStart + len;
    } else if (fieldNumber === 2 && wireType === 2) {
      const { value: len, next: dataStart } = readVarint(bytes, pos);
      name = decoder.decode(bytes.slice(dataStart, dataStart + len));
      pos = dataStart + len;
    } else if (fieldNumber === 3 && wireType === 2) {
      const { value: len, next: dataStart } = readVarint(bytes, pos);
      issuer = decoder.decode(bytes.slice(dataStart, dataStart + len));
      pos = dataStart + len;
    } else if (fieldNumber === 4 && wireType === 0) {
      const res = readVarint(bytes, pos);
      algorithmEnum = res.value;
      pos = res.next;
    } else if (fieldNumber === 5 && wireType === 0) {
      const res = readVarint(bytes, pos);
      digitsEnum = res.value;
      pos = res.next;
    } else if (fieldNumber === 6 && wireType === 0) {
      const res = readVarint(bytes, pos);
      typeEnum = res.value;
      pos = res.next;
    } else {
      pos = skipWireField(bytes, pos, wireType);
    }
  }

  // Only import TOTP entries (type 2 or unspecified 0); skip HOTP (1).
  if (typeEnum === 1 || !secretBytes || secretBytes.length === 0) {
    return null;
  }

  const secretBase32 = encodeBase32(secretBytes);
  const algorithm: MigratedOtpAccount['algorithm'] =
    algorithmEnum === 2 ? 'SHA256' : algorithmEnum === 3 ? 'SHA512' : 'SHA1';
  const digits: 6 | 8 = digitsEnum === 2 ? 8 : 6;

  const cleanIssuer = issuer.trim();
  const cleanName = name.trim() || cleanIssuer || 'Imported 2FA';
  const label = cleanIssuer && !cleanName.startsWith(`${cleanIssuer}:`)
    ? `${encodeURIComponent(cleanIssuer)}:${encodeURIComponent(cleanName)}`
    : encodeURIComponent(cleanName);

  const params = new URLSearchParams({
    secret: secretBase32,
    algorithm,
    digits: String(digits),
    period: '30',
  });
  if (cleanIssuer) {
    params.set('issuer', cleanIssuer);
  }

  return {
    name: cleanName,
    issuer: cleanIssuer,
    secretBase32,
    algorithm,
    digits,
    otpauthUri: `otpauth://totp/${label}?${params.toString()}`,
  };
}

/**
 * Decodes a Google Authenticator `otpauth-migration://offline?data=...` URI
 * into one or more TOTP accounts.
 */
export function parseGoogleAuthenticatorMigrationUri(uri: string): MigratedOtpAccount[] {
  const trimmed = uri.trim();
  if (!trimmed.toLowerCase().startsWith('otpauth-migration://')) {
    return [];
  }

  let payloadBytes: Uint8Array;
  try {
    const parsed = new URL(trimmed);
    const dataParam = parsed.searchParams.get('data');
    if (!dataParam) return [];
    payloadBytes = decodeBase64ToBytes(dataParam);
  } catch {
    return [];
  }

  const accounts: MigratedOtpAccount[] = [];
  let pos = 0;

  while (pos < payloadBytes.length) {
    const { value: tag, next } = readVarint(payloadBytes, pos);
    pos = next;
    const fieldNumber = tag >>> 3;
    const wireType = tag & 7;

    if (fieldNumber === 1 && wireType === 2) {
      const { value: len, next: dataStart } = readVarint(payloadBytes, pos);
      const entryBytes = payloadBytes.slice(dataStart, dataStart + len);
      pos = dataStart + len;
      const account = parseOtpParameters(entryBytes);
      if (account) accounts.push(account);
    } else {
      pos = skipWireField(payloadBytes, pos, wireType);
    }
  }

  return accounts;
}
