/**
 * @file bytes.ts
 * @description The one byte <-> text encoding implementation in this repo.
 *
 * P2-4 measured six copies of `bytesToBase64`, five of `base64ToBytes`, three of
 * `bytesToHex` and one of `hexToBytes`, spread over eleven files. Six copies of a
 * hex encoder is not a style complaint: it is six places where a rounding or
 * padding mistake would silently produce a value that still *looks* like an
 * encoding. The copies were not even equivalent -- `desktopFiles.ts` had grown a
 * chunking loop (large binary export would blow the argument limit on
 * `String.fromCharCode(...bytes)`) while the other five had not, so the encoding
 * of a 2 MB export already differed from the encoding of the same bytes in the
 * biometric bridge.
 *
 * The chunked form is the one kept here, so the weaker copies are the ones that
 * changed. Chunk size 0x8000 keeps the spread call well under the engine's
 * argument limit.
 *
 * `hexToBytes` keeps its tolerant parse (`parseInt` on a trailing odd nibble)
 * rather than being made strict here: a caller that ever passed an odd-length
 * string would get a `Uint8Array` shorter than it asked for instead of an error,
 * and turning that into a throw is a behaviour change that belongs in its own
 * commit, not inside a de-duplication.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

const CHUNK_SIZE = 0x8000;

/** Lowercase, zero-padded hex -- the form the AES-GCM envelope stores `iv`/`tag` in. */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const chunks = hex.match(/.{1,2}/g) ?? [];
  return new Uint8Array(chunks.map((byte) => parseInt(byte, 16)));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK_SIZE));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}