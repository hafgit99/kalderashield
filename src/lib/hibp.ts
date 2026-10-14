/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type HibpPasswordCheck =
  | { status: 'clean'; count: 0 }
  | { status: 'pwned'; count: number }
  | { status: 'unavailable'; count: 0; reason: string };

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const HIBP_TIMEOUT_MS = 4500;
interface CacheEntry {
  data: Map<string, number>;
  timestamp: number;
}
const prefixCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

async function sha1Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle?.digest) {
    throw new Error('WebCrypto SHA-1 digest is not available.');
  }

  const bytes = new TextEncoder().encode(value);
  return toHex(await globalThis.crypto.subtle.digest('SHA-1', bytes));
}

function parseRangeResponse(text: string): Map<string, number> {
  const suffixes = new Map<string, number>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const [suffix, count] = line.split(':');
    if (!suffix || !count) continue;

    const parsedCount = Number(count);
    if (!Number.isFinite(parsedCount) || parsedCount <= 0) continue;
    suffixes.set(suffix.toUpperCase(), parsedCount);
  }

  return suffixes;
}

async function fetchRange(prefix: string): Promise<Map<string, number>> {
  const cached = prefixCache.get(prefix);
  if (cached) {
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    prefixCache.delete(prefix);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);

  try {
    const response = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
      cache: 'no-store',
      headers: {
        'Add-Padding': 'true',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HIBP range request failed with HTTP ${response.status}.`);
    }

    const parsed = parseRangeResponse(await response.text());
    
    // Bounded eviction
    if (prefixCache.size >= MAX_CACHE_SIZE) {
      const oldestKey = prefixCache.keys().next().value;
      if (oldestKey !== undefined) {
        prefixCache.delete(oldestKey);
      }
    }
    
    prefixCache.set(prefix, { data: parsed, timestamp: Date.now() });
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

export async function checkPasswordAgainstHibp(password: string): Promise<HibpPasswordCheck> {
  if (!password) return { status: 'clean', count: 0 };

  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const range = await fetchRange(prefix);
    const count = range.get(suffix) ?? 0;

    return count > 0
      ? { status: 'pwned', count }
      : { status: 'clean', count: 0 };
  } catch (error) {
    return {
      status: 'unavailable',
      count: 0,
      reason: error instanceof Error ? error.message : 'HIBP check failed.',
    };
  }
}

/**
 * Opt-in, and the opt-in has to be explicit.
 *
 * The breach check was on by default: `isHibpCheckEnabled()` read
 * `stored !== 'false'`, so an installation that had never been asked anything
 * answered yes, and the Security Audit screen sent a request for every
 * password in the vault the moment it was opened.
 *
 * The request itself is built so that no password can leave the device — only
 * the first five hex characters of a SHA-1 digest go out, and `Add-Padding`
 * pads the response so its size cannot be correlated back. That is a strong
 * property and it is why the feature is worth having. It is not, though, a
 * reason to make the decision for the user: a password manager is the one
 * category of software where "it contacts a server" has to be earned rather
 * than assumed, and the published privacy policy did not mention this request
 * at all. Defaulting it on meant the shipped product and the shipped policy
 * described two different programs.
 *
 * Installations that already made the choice are unaffected: the key is only
 * written by `setHibpCheckEnabled`, so anyone who turned this on before has
 * `'true'` stored and keeps it, and anyone who turned it off has `'false'`.
 * Only the never-asked case moves, which is the case this change is about.
 */
export const HIBP_STORAGE_KEY = 'KalderaShield_hibp_audit_enabled';

export function isHibpCheckEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(HIBP_STORAGE_KEY) === 'true';
}

export function setHibpCheckEnabled(enabled: boolean): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(HIBP_STORAGE_KEY, enabled ? 'true' : 'false');
  }
}

export function resetHibpCacheForTesting(): void {
  prefixCache.clear();
}
