/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Local persistence for the "recent searches" feature.
 *
 * The history is stored in `localStorage` under a single key as a JSON
 * array. We deliberately keep the API in pure, non-React terms so it
 * can be unit-tested without a DOM, and so the storage backend can be
 * swapped in the future (e.g. IndexedDB) without touching callers.
 *
 * Notes:
 *  - We cap the history at `MAX_RECENT_SEARCHES` entries to keep the
 *    UI panel manageable and to bound storage usage.
 *  - Each entry records when it was last used so the UI can show
 *    relative timestamps later if desired.
 *  - All functions are defensive: a corrupt localStorage value must
 *    not crash the search experience.
 */

import { registerOnCloseSession } from './vaultSession';
import { keyedCollection } from './common/keyedCollection';

export interface RecentSearchEntry {
  /** The query the user actually submitted (trimmed, non-empty). */
  query: string;
  /** ISO-8601 timestamp of when the entry was last used. */
  lastUsedAt: string;
}

export const RECENT_SEARCHES_STORAGE_KEY = 'kalderashield-recent-searches';
export const MAX_RECENT_SEARCHES = 10;

function parseEntry(raw: unknown): RecentSearchEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.query !== 'string' || obj.query.trim().length === 0) return null;
  if (typeof obj.lastUsedAt !== 'string') return null;
  return { query: obj.query, lastUsedAt: obj.lastUsedAt };
}

/**
 * `removeWhenEmpty` because a search history is not state the user chose to
 * keep: leaving the last query on disk after the list empties would leave a
 * fragment of what they were looking for. The other three collections write `[]`
 * instead, which is right for them.
 */
const recentSearches = keyedCollection<RecentSearchEntry>({
  storageKey: RECENT_SEARCHES_STORAGE_KEY,
  parseEntry,
  maxEntries: MAX_RECENT_SEARCHES,
  removeWhenEmpty: true,
});

export function readRecentSearches(): RecentSearchEntry[] {
  return recentSearches.read();
}

function writeEntries(entries: RecentSearchEntry[]): void {
  recentSearches.write(entries);
}

/**
 * Add a query to the history. If the same query (case-insensitive) is
 * already present, it is moved to the top and its timestamp updated.
 */
export function recordRecentSearch(query: string): RecentSearchEntry[] {
  const trimmed = query.trim();
  if (!trimmed) return readRecentSearches();

  const existing = readRecentSearches().filter(
    (entry) => entry.query.toLowerCase() !== trimmed.toLowerCase(),
  );
  const next: RecentSearchEntry[] = [
    { query: trimmed, lastUsedAt: new Date().toISOString() },
    ...existing,
  ].slice(0, MAX_RECENT_SEARCHES);
  writeEntries(next);
  return next;
}

/** Remove a single entry from the history. */
export function removeRecentSearch(query: string): RecentSearchEntry[] {
  const next = readRecentSearches().filter(
    (entry) => entry.query.toLowerCase() !== query.toLowerCase(),
  );
  writeEntries(next);
  return next;
}

/** Wipe the entire history. */
export function clearRecentSearches(): void {
  recentSearches.clear();
}

registerOnCloseSession(() => {
  clearRecentSearches();
});

