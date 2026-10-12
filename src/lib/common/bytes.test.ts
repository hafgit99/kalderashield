// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { base64ToBytes, bytesToBase64, bytesToHex, hexToBytes } from './bytes';

/**
 * These assertions are the reason the six copies were worth collapsing: the
 * chunk boundary is the one place the copies disagreed. `desktopFiles.ts` had a
 * chunking loop and the other five did not, so the same bytes encoded two
 * different ways depending on which subsystem was handling them.
 */
const CHUNK_SIZE = 0x8000;

describe('bytes', () => {
  describe('bytesToHex', () => {
    it('zero-pads every byte to two characters', () => {
      expect(bytesToHex(new Uint8Array([0x00, 0x0f, 0xa0, 0xff]))).toBe('000fa0ff');
    });

    it('returns an empty string for an empty array', () => {
      expect(bytesToHex(new Uint8Array([]))).toBe('');
    });
  });

  describe('hexToBytes', () => {
    it('round-trips with bytesToHex', () => {
      const bytes = new Uint8Array([0, 1, 15, 16, 128, 254, 255]);
      expect(Array.from(hexToBytes(bytesToHex(bytes)))).toEqual(Array.from(bytes));
    });

    it('keeps its tolerant parse of a trailing odd nibble', () => {
      // Deliberately preserved from webcrypto.ts: an odd-length string yields a
      // shorter array rather than throwing. Tightening that is a behaviour
      // change, not a de-duplication.
      expect(Array.from(hexToBytes('abc'))).toEqual([0xab, 0x0c]);
    });

    it('returns an empty array for an empty string', () => {
      expect(Array.from(hexToBytes(''))).toEqual([]);
    });
  });

  describe('bytesToBase64', () => {
    it('encodes ASCII bytes the way btoa would', () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]);
      expect(bytesToBase64(bytes)).toBe(btoa('Hello'));
    });

it('encodes bytes above 0x7f without sign-extension damage', () => {
      const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x80]);
      let binary = '';
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      expect(bytesToBase64(bytes)).toBe(btoa(binary));
      expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    });

    it('encodes identically across the chunk boundary', () => {
      const bytes = new Uint8Array(CHUNK_SIZE * 2 + 17);
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = i % 256;
      // Reference: the naive single-string form the other five copies used.
      let binary = '';
      bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
      });
      expect(bytesToBase64(bytes)).toBe(btoa(binary));
    });

    it('encodes a large buffer without exceeding the spread argument limit', () => {
      // `String.fromCharCode(...bytes)` on a 2 MB buffer is the failure this
      // chunking exists for; V8's limit is around 64k arguments.
      const bytes = new Uint8Array(2 * 1024 * 1024).fill(65);
      expect(() => bytesToBase64(bytes)).not.toThrow();
      expect(base64ToBytes(bytesToBase64(bytes))).toHaveLength(bytes.length);
    });

    it('returns an empty string for an empty array', () => {
      expect(bytesToBase64(new Uint8Array([]))).toBe('');
    });
  });

  describe('base64ToBytes', () => {
    it('round-trips with bytesToBase64, including high bytes', () => {
      const bytes = new Uint8Array(256);
      for (let i = 0; i < 256; i += 1) bytes[i] = i;
      expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
    });

    it('returns an empty array for an empty string', () => {
      expect(Array.from(base64ToBytes(''))).toEqual([]);
    });

    it('throws on input that is not base64, rather than returning junk', () => {
      expect(() => base64ToBytes('not base64!!')).toThrow();
    });
  });
});