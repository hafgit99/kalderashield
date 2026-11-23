/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Minimal deterministic CBOR/COSE and ASN.1 DER encoding helpers for
 * KalderaShield's vault-backed WebAuthn passkey provider.
 *
 * Implements only the exact CTAP2/WebAuthn subset required for:
 *  - COSE EC2 P-256 public keys (RFC 8152 / WebAuthn §6.5.1)
 *  - `none` attestationObject envelopes (WebAuthn §6.5.4)
 *  - WebCrypto raw ECDSA P-256 (r || s) -> ASN.1 DER signature conversion
 */

export type CborValue =
  | number
  | string
  | Uint8Array
  | Map<number | string, CborValue>;

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function encodeMajorAndArg(majorType: number, arg: number): Uint8Array {
  if (!Number.isInteger(arg) || arg < 0 || arg > 0xffff_ffff) {
    throw new RangeError(`CBOR argument out of uint32 range: ${arg}`);
  }
  const major = (majorType & 0x07) << 5;
  if (arg < 24) {
    return new Uint8Array([major | arg]);
  }
  if (arg <= 0xff) {
    return new Uint8Array([major | 24, arg]);
  }
  if (arg <= 0xffff) {
    return new Uint8Array([major | 25, (arg >>> 8) & 0xff, arg & 0xff]);
  }
  return new Uint8Array([
    major | 26,
    (arg >>> 24) & 0xff,
    (arg >>> 16) & 0xff,
    (arg >>> 8) & 0xff,
    arg & 0xff,
  ]);
}

function compareCborKeys(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i += 1) {
    const diff = a[i]! - b[i]!;
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Encodes a WebAuthn/CTAP2 canonical CBOR value.
 * Map entries are sorted by encoded key length then lexicographically per CTAP2 §6.
 */
export function encodeCbor(value: CborValue): Uint8Array {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new RangeError('CBOR floating-point numbers are not used in WebAuthn structures');
    }
    if (value >= 0) {
      return encodeMajorAndArg(0, value);
    }
    return encodeMajorAndArg(1, -1 - value);
  }

  if (typeof value === 'string') {
    const utf8 = new TextEncoder().encode(value);
    return concatBytes([encodeMajorAndArg(3, utf8.length), utf8]);
  }

  if (value instanceof Uint8Array) {
    return concatBytes([encodeMajorAndArg(2, value.length), value]);
  }

  if (value instanceof Map) {
    const encodedEntries: Array<{ keyBytes: Uint8Array; valBytes: Uint8Array }> = [];
    for (const [k, v] of value.entries()) {
      encodedEntries.push({
        keyBytes: encodeCbor(k),
        valBytes: encodeCbor(v),
      });
    }
    encodedEntries.sort((a, b) => compareCborKeys(a.keyBytes, b.keyBytes));
    const parts: Uint8Array[] = [encodeMajorAndArg(5, encodedEntries.length)];
    for (const entry of encodedEntries) {
      parts.push(entry.keyBytes, entry.valBytes);
    }
    return concatBytes(parts);
  }

  throw new TypeError('Unsupported CBOR value');
}

/**
 * Encodes an EC2 P-256 public key in COSE_Key format (RFC 8152 / WebAuthn §6.5.1):
 *   { 1: 2 (EC2), 3: -7 (ES256), -1: 1 (P-256), -2: x (32B), -3: y (32B) }
 */
export function encodeCoseP256PublicKey(x: Uint8Array, y: Uint8Array): Uint8Array {
  if (x.length !== 32 || y.length !== 32) {
    throw new RangeError(`COSE P-256 coordinates must be 32 bytes each (got ${x.length}, ${y.length})`);
  }
  const map = new Map<number | string, CborValue>([
    [1, 2],   // kty: EC2
    [3, -7],  // alg: ES256
    [-1, 1],  // crv: P-256
    [-2, x],  // x coordinate
    [-3, y],  // y coordinate
  ]);
  return encodeCbor(map);
}

/**
 * Encodes a WebAuthn `none` attestationObject:
 *   { "fmt": "none", "attStmt": {}, "authData": <bytes> }
 */
export function encodeNoneAttestationObject(authenticatorData: Uint8Array): Uint8Array {
  const map = new Map<number | string, CborValue>([
    ['fmt', 'none'],
    ['attStmt', new Map<number | string, CborValue>()],
    ['authData', authenticatorData],
  ]);
  return encodeCbor(map);
}

function encodeDerPositiveInteger(coordinate: Uint8Array): Uint8Array {
  let start = 0;
  while (start < coordinate.length - 1 && coordinate[start] === 0x00) {
    start += 1;
  }
  const trimmed = coordinate.subarray(start);
  const needsZeroPad = (trimmed[0]! & 0x80) !== 0;
  const length = trimmed.length + (needsZeroPad ? 1 : 0);
  const out = new Uint8Array(2 + length);
  out[0] = 0x02; // ASN.1 INTEGER
  out[1] = length;
  if (needsZeroPad) {
    out[2] = 0x00;
    out.set(trimmed, 3);
  } else {
    out.set(trimmed, 2);
  }
  return out;
}

/**
 * Converts a WebCrypto IEEE P1363 raw ECDSA signature (`r || s`, 64 bytes for P-256)
 * into ASN.1 DER `SEQUENCE { r INTEGER, s INTEGER }` required by WebAuthn Relying Parties.
 */
export function rawEcdsaToDer(rawSignature: Uint8Array, coordinateLength = 32): Uint8Array {
  if (rawSignature.length !== coordinateLength * 2) {
    throw new RangeError(
      `Expected ${coordinateLength * 2}-byte raw ECDSA signature, got ${rawSignature.length}`,
    );
  }
  const rDer = encodeDerPositiveInteger(rawSignature.subarray(0, coordinateLength));
  const sDer = encodeDerPositiveInteger(rawSignature.subarray(coordinateLength));
  const seqLength = rDer.length + sDer.length;
  const out = new Uint8Array(2 + seqLength);
  out[0] = 0x30; // ASN.1 SEQUENCE
  out[1] = seqLength;
  out.set(rDer, 2);
  out.set(sDer, 2 + rDer.length);
  return out;
}
