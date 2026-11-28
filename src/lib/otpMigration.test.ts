/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parseGoogleAuthenticatorMigrationUri } from './otpMigration';

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return bytes;
}

function encodeBytesField(fieldNumber: number, payload: Uint8Array | number[]): number[] {
  const arr = Array.from(payload);
  return [...encodeVarint((fieldNumber << 3) | 2), ...encodeVarint(arr.length), ...arr];
}

function encodeStringField(fieldNumber: number, value: string): number[] {
  return encodeBytesField(fieldNumber, new TextEncoder().encode(value));
}

function encodeVarintField(fieldNumber: number, value: number): number[] {
  return [...encodeVarint((fieldNumber << 3) | 0), ...encodeVarint(value)];
}

function toBase64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

describe('otpMigration (Google Authenticator protobuf decoder)', () => {
  it('decodes multiple TOTP accounts from otpauth-migration URIs', () => {
    // Secret bytes for Base32 "JBSWY3DPEHPK3PXP" -> "Hello!\xDE\xAD\xBE\xEF"
    const secret1 = [0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef];
    const otp1 = [
      ...encodeBytesField(1, secret1),
      ...encodeStringField(2, 'GitHub:alice@example.com'),
      ...encodeStringField(3, 'GitHub'),
      ...encodeVarintField(4, 1), // SHA1
      ...encodeVarintField(5, 1), // 6 digits
      ...encodeVarintField(6, 2), // TOTP
    ];
    const otp2 = [
      ...encodeBytesField(1, [0x31, 0x32, 0x33, 0x34, 0x35]),
      ...encodeStringField(2, 'Cloudflare:ops@example.com'),
      ...encodeStringField(3, 'Cloudflare'),
      ...encodeVarintField(4, 2), // SHA256
      ...encodeVarintField(5, 2), // 8 digits
      ...encodeVarintField(6, 2), // TOTP
    ];
    const payload = [...encodeBytesField(1, otp1), ...encodeBytesField(1, otp2)];
    const uri = `otpauth-migration://offline?data=${encodeURIComponent(toBase64(payload))}`;

    const accounts = parseGoogleAuthenticatorMigrationUri(uri);
    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toMatchObject({
      issuer: 'GitHub',
      name: 'GitHub:alice@example.com',
      secretBase32: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
    });
    expect(accounts[0]?.otpauthUri).toContain('otpauth://totp/');
    expect(accounts[0]?.otpauthUri).toContain('secret=JBSWY3DPEHPK3PXP');

    expect(accounts[1]).toMatchObject({
      issuer: 'Cloudflare',
      name: 'Cloudflare:ops@example.com',
      algorithm: 'SHA256',
      digits: 8,
    });
    expect(accounts[1]?.otpauthUri).toContain('algorithm=SHA256');
    expect(accounts[1]?.otpauthUri).toContain('digits=8');
  });

  it('skips non-TOTP HOTP entries and handles malformed inputs safely', () => {
    const hotpOnly = [
      ...encodeBytesField(1, [0x01, 0x02, 0x03]),
      ...encodeStringField(2, 'Legacy'),
      ...encodeVarintField(6, 1), // HOTP
    ];
    const uri = `otpauth-migration://offline?data=${encodeURIComponent(toBase64(encodeBytesField(1, hotpOnly)))}`;

    expect(parseGoogleAuthenticatorMigrationUri(uri)).toEqual([]);
    expect(parseGoogleAuthenticatorMigrationUri('https://example.com')).toEqual([]);
    expect(parseGoogleAuthenticatorMigrationUri('otpauth-migration://offline?data=!!!invalid!!!')).toEqual([]);
  });
});
