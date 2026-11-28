/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../types';
import type { WebCryptoAesGcmPayload } from './webcrypto';
import { generateSafeIv, webCryptoAesGcmDecrypt, webCryptoAesGcmEncrypt } from './webcrypto';
import { deriveArgon2idKey } from './argon2id';
import { secureRandomBytes } from './random';

export interface DecryptedSharePayload {
  title: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  category: VaultItem['category'];
  totpSecret?: string;
  expiresAt: number;
}

/** Public HTTPS fallback base URL when sharing from desktop/mobile Tauri local origins. */
export const PUBLIC_SHARE_BASE_URL = 'https://kalderashield.com/share/';

function resolveShareBaseUrl(): string {
  if (typeof window === 'undefined' || !window.location) {
    return PUBLIC_SHARE_BASE_URL;
  }
  const { protocol, hostname, origin, pathname } = window.location;
  const hostLower = (hostname || '').toLowerCase();
  const isNativeLocalOrigin =
    protocol === 'tauri:' ||
    protocol === 'file:' ||
    protocol === 'capacitor:' ||
    hostLower === 'tauri.localhost' ||
    hostLower.endsWith('.tauri.localhost');
  if (isNativeLocalOrigin || !origin || origin === 'null') {
    return PUBLIC_SHARE_BASE_URL;
  }
  return origin + pathname;
}

function extractShareHashFragment(rawInput: string): string {
  const trimmed = rawInput.trim();
  if (!trimmed) return '';
  const hashIdx = trimmed.indexOf('#');
  if (hashIdx !== -1) {
    return trimmed.slice(hashIdx + 1);
  }
  return trimmed.replace(/^#/, '');
}
/** Maximum share link duration in hours. */
export const MAX_SHARE_DURATION_HOURS = 24;

/** Minimum share password length. K-2: raised from 4 — a 4-character ASCII
 * password over a fast KDF is exhaustible in under a second on a GPU. */
export const MIN_SHARE_PASSWORD_LENGTH = 12;

/**
 * Encodes Uint8Array into a base64url string.
 */
export function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes a base64url string into a Uint8Array.
 */
export function base64urlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derives a 32-byte AES-256 key from a user-provided share password and salt
 * using Argon2id (64 MiB / 3 iterations — the same memory-hard KDF profile
 * the vault itself uses).
 *
 * K-2: HKDF is a *derivation* function, not a password hardening function —
 * one guess cost two HMAC-SHA256 invocations (~10⁹ guesses/s on a GPU).
 * Argon2id makes offline guessing of the share password memory-bound.
 *
 * 32 MiB / 3 iterations = the repo's CROSS_PLATFORM_KDF_PROFILE: WASM
 * runtimes (the share receive path runs in the browser) can fail
 * allocations above ~64 MiB (see argon2id.ts). Still orders of magnitude
 * beyond the old HKDF cost.
 */
async function deriveShareKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const saltHex = Array.from(salt).map((b) => b.toString(16).padStart(2, '0')).join('');
  return deriveArgon2idKey(password, saltHex, {
    memoryKiB: 32 * 1024,
    iterations: 3,
  });
}

/**
 * Encrypts a vault item using AES-256-GCM with a key derived from a
 * user-provided share password via HKDF-SHA256, and generates a secure
 * local share URL.
 *
 * Security: The decryption key is NOT embedded in the URL. The recipient
 * must know the share password to decrypt. The URL only contains the
 * encrypted bundle and the HKDF salt.
 *
 * @param item - The vault item to share.
 * @param durationHours - Link expiration duration (capped at MAX_SHARE_DURATION_HOURS).
 * @param sharePassword - User-provided password for key derivation.
 */
export async function generateShareUrl(
  item: VaultItem,
  durationHours: number,
  sharePassword: string,
): Promise<string> {
  if (!sharePassword || sharePassword.length < MIN_SHARE_PASSWORD_LENGTH) {
    throw new Error('share-password-too-short');
  }

  const clampedDuration = Math.min(Math.max(durationHours, 1), MAX_SHARE_DURATION_HOURS);
  const expiresAt = Date.now() + clampedDuration * 3600 * 1000;
  const payload: DecryptedSharePayload = {
    title: item.title,
    username: item.username,
    password: item.password,
    url: item.url,
    notes: item.notes,
    category: item.category,
    totpSecret: item.totpSecret,
    expiresAt,
  };

  const plaintext = JSON.stringify(payload);
  const salt = secureRandomBytes(16);
  const derivedKey = await deriveShareKey(sharePassword, salt);
  const iv = generateSafeIv();

  // K-2: bind the salt (the `s=` URL parameter) into the AEAD as associated
  // data — a salt swapped between two share bundles now breaks GCM
  // verification instead of silently decrypting with the wrong key context.
  const encrypted = await webCryptoAesGcmEncrypt(plaintext, derivedKey, iv, salt);

  // Pack the encrypted payload (iv, tag, ciphertext)
  const bundle = JSON.stringify({
    i: encrypted.iv,
    t: encrypted.tag,
    c: encrypted.ciphertext,
  });

  const bundleBytes = new TextEncoder().encode(bundle);
  const d = base64urlEncode(bundleBytes);
  const s = base64urlEncode(salt);

  const baseUrl = resolveShareBaseUrl();
  return `${baseUrl}#share=${d}&s=${s}`;
}

/**
 * Decrypts a secure local share hash fragment or full share URL into the original vault item.
 * Requires the same share password that was used during encryption.
 *
 * @param hash - The URL hash fragment or full share URL (e.g., "#share=...&s=...").
 * @param sharePassword - The password used when generating the share URL.
 */
export async function decryptShareUrl(
  hash: string,
  sharePassword: string,
): Promise<DecryptedSharePayload | null> {
  try {
    if (!sharePassword) return null;

    const hashClean = extractShareHashFragment(hash);
    const params = new URLSearchParams(hashClean);
    const d = params.get('share');
    const s = params.get('s');

    if (!d || !s) return null;

    const bundleBytes = base64urlDecode(d);
    const bundleStr = new TextDecoder().decode(bundleBytes);
    const bundle = JSON.parse(bundleStr) as { i: string; t: string; c: string };

    const salt = base64urlDecode(s);
    const derivedKey = await deriveShareKey(sharePassword, salt);

    const gcmPayload: WebCryptoAesGcmPayload = {
      iv: bundle.i,
      tag: bundle.t,
      ciphertext: bundle.c,
    };

    const plaintext = await webCryptoAesGcmDecrypt(gcmPayload, derivedKey, salt);
    const decrypted = JSON.parse(plaintext) as DecryptedSharePayload;

    if (decrypted.expiresAt && Date.now() > decrypted.expiresAt) {
      return null;
    }

    return decrypted;
  } catch {
    return null;
  }
}
