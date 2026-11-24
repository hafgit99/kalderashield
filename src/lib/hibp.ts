/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { invoke } from '@tauri-apps/api/core';
import { acquireHibpOriginLease } from './airgapNetworkPolicy';
import { secureRandomIndex } from './random';
import { registerOnCloseSession } from './vaultSession';

export type HibpPasswordCheck =
  | { status: 'clean'; count: 0 }
  | { status: 'pwned'; count: number }
  | { status: 'unavailable'; count: 0; reason: string; rateLimited?: boolean };

export interface HibpCheckOptions {
  signal?: AbortSignal;
}

export interface HibpScanItem {
  id: string;
  password: string;
}

export interface HibpBatchScanOptions {
  signal?: AbortSignal;
  concurrency?: number;
  maxConsecutiveFailures?: number;
  onProgress?: (done: number, total: number) => void;
  checkPassword?: (password: string, options?: HibpCheckOptions) => Promise<HibpPasswordCheck>;
}

export interface HibpBatchScanResult {
  pwnedByItemId: Map<string, number>;
  status: 'complete' | 'unavailable' | 'aborted';
  checkedCount: number;
  totalCount: number;
}

export interface LocalHibpFileInfo {
  path: string;
  fileName: string;
  sizeBytes: number;
}

interface LocalHibpMatch {
  hash: string;
  count: number;
}

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const HIBP_TIMEOUT_MS = 4500;
const MAX_RANGE_BYTES = 512 * 1024; // 512 KiB safety ceiling (~10x typical padded response)
const SUFFIX_HEX_RE = /^[0-9A-F]{35}$/;

interface CacheEntry {
  data: Map<string, number>;
  timestamp: number;
}

const prefixCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Clear cached SHA-1 prefix buckets whenever the vault locks so no password
// metadata lingers in RAM across locked sessions.
registerOnCloseSession(() => {
  prefixCache.clear();
});

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
  if (text.length > MAX_RANGE_BYTES) {
    throw new Error('HIBP range response exceeded maximum allowed size.');
  }

  const suffixes = new Map<string, number>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) continue;

    const suffix = line.slice(0, colonIndex).trim().toUpperCase();
    const countRaw = line.slice(colonIndex + 1).trim();
    if (!SUFFIX_HEX_RE.test(suffix) || !countRaw) continue;

    const parsedCount = Number(countRaw);
    // HIBP Add-Padding entries have count === 0 and must be ignored.
    if (!Number.isSafeInteger(parsedCount) || parsedCount <= 0) continue;
    suffixes.set(suffix, parsedCount);
  }

  return suffixes;
}

function isTauriInvokeAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__;
  return typeof internals?.invoke === 'function';
}

function createAbortError(): Error {
  const err = new Error('HIBP check aborted.');
  err.name = 'AbortError';
  return err;
}

async function fetchRangeTextViaTauri(prefix: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw createAbortError();

  const invokePromise = invoke<string>('fetch_hibp_range', { prefix });
  if (!signal) return invokePromise;

  return new Promise<string>((resolve, reject) => {
    const onAbort = () => reject(createAbortError());
    signal.addEventListener('abort', onAbort, { once: true });
    invokePromise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

async function fetchRangeTextViaWeb(prefix: string, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw createAbortError();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HIBP_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  const releaseLease = acquireHibpOriginLease();
  try {
    const response = await fetch(`${HIBP_RANGE_URL}${prefix}`, {
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        'Add-Padding': 'true',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HIBP range request failed with HTTP ${response.status}.`);
    }

    const contentLengthHeader = response.headers?.get?.('content-length');
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength) && contentLength > MAX_RANGE_BYTES) {
        throw new Error('HIBP range response exceeded maximum allowed size.');
      }
    }

    return await response.text();
  } finally {
    releaseLease();
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

async function fetchRange(prefix: string, signal?: AbortSignal): Promise<Map<string, number>> {
  if (signal?.aborted) throw createAbortError();

  const cached = prefixCache.get(prefix);
  if (cached) {
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    prefixCache.delete(prefix);
  }

  const rawText = isTauriInvokeAvailable()
    ? await fetchRangeTextViaTauri(prefix, signal)
    : await fetchRangeTextViaWeb(prefix, signal);

  const parsed = parseRangeResponse(rawText);

  // Bounded eviction (FIFO)
  if (prefixCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = prefixCache.keys().next().value;
    if (oldestKey !== undefined) {
      prefixCache.delete(oldestKey);
    }
  }

  prefixCache.set(prefix, { data: parsed, timestamp: Date.now() });
  return parsed;
}

export async function checkPasswordAgainstHibp(
  password: string,
  options?: HibpCheckOptions,
): Promise<HibpPasswordCheck> {
  if (!password) return { status: 'clean', count: 0 };
  if (options?.signal?.aborted) {
    return { status: 'unavailable', count: 0, reason: 'HIBP check aborted.' };
  }

  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    const range = await fetchRange(prefix, options?.signal);
    const count = range.get(suffix) ?? 0;

    return count > 0
      ? { status: 'pwned', count }
      : { status: 'clean', count: 0 };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'HIBP check failed.';
    const rateLimited = /HTTP 429\b/.test(reason);
    return {
      status: 'unavailable',
      count: 0,
      reason,
      ...(rateLimited ? { rateLimited: true } : {}),
    };
  }
}

function shuffleWithCsprng<T>(items: T[]): T[] {
  const copy = items.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = secureRandomIndex(i + 1);
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Privacy-preserving batch HIBP scan for vault items.
 *
 * - Groups items by unique password so identical passwords are checked once.
 * - Shuffles lookup order using CSPRNG (`secureRandomIndex`) so network
 *   observers cannot fingerprint a vault by deterministic prefix ordering.
 * - Limits concurrency (default 3) and trips a circuit-breaker after
 *   consecutive failures or HTTP 429 so offline vaults do not hang for
 *   `timeout * N`.
 * - Returns results keyed by `itemId` rather than plaintext password.
 */
export async function scanVaultItemsAgainstHibp(
  items: HibpScanItem[],
  options?: HibpBatchScanOptions,
): Promise<HibpBatchScanResult> {
  const itemIdsByPassword = new Map<string, string[]>();
  for (const item of items) {
    if (!item.password) continue;
    const list = itemIdsByPassword.get(item.password);
    if (list) {
      list.push(item.id);
    } else {
      itemIdsByPassword.set(item.password, [item.id]);
    }
  }

  const uniquePasswords = shuffleWithCsprng([...itemIdsByPassword.keys()]);
  const totalCount = uniquePasswords.length;
  const pwnedByItemId = new Map<string, number>();

  if (totalCount === 0) {
    return { pwnedByItemId, status: 'complete', checkedCount: 0, totalCount: 0 };
  }

  const signal = options?.signal;
  const checkFn = options?.checkPassword ?? checkPasswordAgainstHibp;
  const maxConsecutiveFailures = Math.max(1, options?.maxConsecutiveFailures ?? 2);
  const workerCount = Math.min(Math.max(1, options?.concurrency ?? 3), totalCount);

  let nextIndex = 0;
  let checkedCount = 0;
  let consecutiveFailures = 0;
  let unavailable = false;
  let circuitTripped = false;

  const runWorker = async () => {
    while (true) {
      if (signal?.aborted || circuitTripped) return;
      const current = nextIndex;
      if (current >= totalCount) return;
      nextIndex += 1;

      const password = uniquePasswords[current]!;
      const result = await checkFn(password, { signal });
      if (signal?.aborted) return;

      checkedCount += 1;
      options?.onProgress?.(checkedCount, totalCount);

      if (result.status === 'pwned') {
        consecutiveFailures = 0;
        for (const itemId of itemIdsByPassword.get(password) ?? []) {
          pwnedByItemId.set(itemId, result.count);
        }
      } else if (result.status === 'clean') {
        consecutiveFailures = 0;
      } else {
        unavailable = true;
        consecutiveFailures += 1;
        if (result.rateLimited || consecutiveFailures >= maxConsecutiveFailures) {
          circuitTripped = true;
          return;
        }
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  if (signal?.aborted) {
    return { pwnedByItemId, status: 'aborted', checkedCount, totalCount };
  }

  return {
    pwnedByItemId,
    status: unavailable ? 'unavailable' : 'complete',
    checkedCount,
    totalCount,
  };
}

/**
 * Opt-in, and the opt-in has to be explicit.
 *
 * The breach check starts off until the user enables it. Turning it on or off
 * persists in localStorage under `HIBP_STORAGE_KEY`.
 */
export const HIBP_STORAGE_KEY = 'KalderaShield_hibp_audit_enabled';
export const HIBP_LOCAL_PATH_KEY = 'KalderaShield_hibp_local_db_path';

export function isLocalHibpSupported(): boolean {
  return isTauriInvokeAvailable();
}

export function getLocalHibpFilePath(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(HIBP_LOCAL_PATH_KEY)?.trim();
  return value ? value : null;
}

export function setLocalHibpFilePath(path: string | null): void {
  if (typeof localStorage === 'undefined') return;
  const trimmed = path?.trim();
  if (trimmed) {
    localStorage.setItem(HIBP_LOCAL_PATH_KEY, trimmed);
  } else {
    localStorage.removeItem(HIBP_LOCAL_PATH_KEY);
  }
}

export async function selectLocalHibpFile(): Promise<LocalHibpFileInfo | null> {
  if (!isTauriInvokeAvailable()) return null;
  return invoke<LocalHibpFileInfo | null>('select_hibp_local_file');
}

/**
 * Fully offline (air-gap) HIBP scan against a local sorted SHA-1 database file.
 *
 * Computes SHA-1 hashes locally via WebCrypto and sends only the 40-char hex
 * digests to Rust (`check_hibp_local_file`), which executes O(log N) binary
 * search directly on disk with < 1 MiB RAM and zero network traffic.
 */
export async function scanVaultItemsAgainstLocalHibp(
  filePath: string,
  items: HibpScanItem[],
  options?: { signal?: AbortSignal },
): Promise<HibpBatchScanResult> {
  const signal = options?.signal;
  const pwnedByItemId = new Map<string, number>();

  if (!filePath.trim() || !isTauriInvokeAvailable()) {
    return { pwnedByItemId, status: 'unavailable', checkedCount: 0, totalCount: 0 };
  }

  const itemIdsByHash = new Map<string, string[]>();
  try {
    for (const item of items) {
      if (signal?.aborted) {
        return { pwnedByItemId, status: 'aborted', checkedCount: 0, totalCount: 0 };
      }
      if (!item.password) continue;
      const hash = await sha1Hex(item.password);
      const list = itemIdsByHash.get(hash);
      if (list) {
        list.push(item.id);
      } else {
        itemIdsByHash.set(hash, [item.id]);
      }
    }

    const uniqueHashes = [...itemIdsByHash.keys()];
    if (uniqueHashes.length === 0) {
      return { pwnedByItemId, status: 'complete', checkedCount: 0, totalCount: 0 };
    }
    if (signal?.aborted) {
      return { pwnedByItemId, status: 'aborted', checkedCount: 0, totalCount: uniqueHashes.length };
    }

    const matches = await invoke<LocalHibpMatch[]>('check_hibp_local_file', {
      path: filePath,
      hashes: uniqueHashes,
    });

    if (signal?.aborted) {
      return { pwnedByItemId, status: 'aborted', checkedCount: 0, totalCount: uniqueHashes.length };
    }

    for (const match of matches) {
      if (!Number.isSafeInteger(match.count) || match.count <= 0) continue;
      const normalized = match.hash.toUpperCase();
      for (const itemId of itemIdsByHash.get(normalized) ?? []) {
        pwnedByItemId.set(itemId, match.count);
      }
    }

    return {
      pwnedByItemId,
      status: 'complete',
      checkedCount: uniqueHashes.length,
      totalCount: uniqueHashes.length,
    };
  } catch {
    return {
      pwnedByItemId,
      status: 'unavailable',
      checkedCount: 0,
      totalCount: itemIdsByHash.size,
    };
  }
}

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
