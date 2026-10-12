import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';

import { sha256Hex, sha256HexOfString } from './sha256';

function nodeHash(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('sha256', () => {
  it('matches the published digest for the empty input', async () => {
    await expect(sha256Hex(new Uint8Array([]))).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('agrees with node crypto for raw bytes', async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    await expect(sha256Hex(bytes)).resolves.toBe(nodeHash(bytes));
  });

  it('hashes strings as UTF-8, so both entry points agree', async () => {
    // The five copies this replaced each encoded differently at their own call
    // site; this is the assertion that the shared encoding is the UTF-8 one.
    const value = 'kasa-şifre-🙂-Δ';
    await expect(sha256HexOfString(value)).resolves.toBe(
      nodeHash(new TextEncoder().encode(value)),
    );
  });

  it('produces lower-case, zero-padded hex of exactly 64 characters', async () => {
    const digest = await sha256HexOfString('any');
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });
});