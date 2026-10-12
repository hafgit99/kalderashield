/**
 * @file keyedCollection.ts
 * @description The one localStorage-backed JSON collection in this repo.
 *
 * P2-4 measured four files carrying the same skeleton: an
 * `isStorageAvailable` guard, a `readRaw` that parsed an array and kept only the
 * entries a type-specific validator accepted, a `writeRaw` that swallowed quota
 * errors, and a `clear` that removed the key. `folders.ts`, `tags.ts`,
 * `smartFolders.ts` and `recentSearches.ts` were the four.
 *
 * What is *not* shared is the part that matters to each library: the tree
 * invariants folders enforce, the slug de-duplication tags do, the built-in
 * presets smart folders merge in. Only the persistence envelope is factored, and
 * the validators stay in their own files -- a shared validator is how a folder
 * starts accepting a tag's shape.
 *
 * Behaviour that differed between the four copies and is now explicit rather
 * than accidental:
 *
 *  - `folders` and `tags` capped at 500 / 200 entries on read *and* on write;
 *    `smartFolders` capped nowhere. `maxEntries` is therefore optional, and a
 *    library with no cap passes none instead of inheriting someone else's number.
 *  - `recentSearches` removed the key entirely when the list emptied, so nothing
 *    was left behind for the next session. The other three wrote `[]`. That is
 *    `removeWhenEmpty`, and only recent searches wants it: an empty folder
 *    library and an empty tag library are meaningful states a user may have
 *    produced on purpose, whereas leftover recent searches are a privacy
 *    liability.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

export interface KeyedCollectionOptions<T> {
  /** The `localStorage` key this collection lives under. */
  storageKey: string;
  /**
   * Validates and normalises one stored entry. Returning `null` drops the
   * entry, which is how a corrupt value gets ignored instead of crashing the
   * library that owns it.
   */
  parseEntry: (raw: unknown) => T | null;
  /** Hard cap applied on both read and write. Omit for a collection with no cap. */
  maxEntries?: number;
  /** Remove the key instead of storing `[]` when the collection is written empty. */
  removeWhenEmpty?: boolean;
}

export interface KeyedCollection<T> {
  read(): T[];
  /** Persists `entries`, returning exactly what was stored. */
  write(entries: T[]): T[];
  clear(): void;
}

export function isStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function keyedCollection<T>(options: KeyedCollectionOptions<T>): KeyedCollection<T> {
  const { storageKey, parseEntry, maxEntries, removeWhenEmpty = false } = options;

  const cap = (entries: T[]): T[] =>
    maxEntries === undefined ? entries : entries.slice(0, maxEntries);

  return {
    read(): T[] {
      if (!isStorageAvailable()) return [];
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        const out: T[] = [];
        for (const entry of parsed) {
          const valid = parseEntry(entry);
          if (valid) out.push(valid);
        }
        return cap(out);
      } catch {
        // A corrupt or unreadable value yields an empty collection rather than
        // taking down the caller. The stored bytes are left untouched so a
        // later write can still replace them.
        return [];
      }
    },

    write(entries: T[]): T[] {
      if (!isStorageAvailable()) return cap(entries);
      const safe = cap(entries);
      try {
        if (removeWhenEmpty && safe.length === 0) {
          window.localStorage.removeItem(storageKey);
        } else {
          window.localStorage.setItem(storageKey, JSON.stringify(safe));
        }
      } catch {
        // Quota and private-mode errors are non-fatal: the in-memory result the
        // caller was handed is still correct for this session.
      }
      return safe;
    },

    clear(): void {
      if (!isStorageAvailable()) return;
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Nothing to do -- there is no caller-visible failure to report.
      }
    },
  };
}

/**
 * Local id generator: `<prefix>-<base36 time>-<base36 counter>`.
 *
 * The counter is per-factory rather than per-module so two collections cannot
 * consume each other's sequence; the prefix already keeps their ids apart, but a
 * shared counter would make an id's counter component mean "how many things
 * happened anywhere in the app", which is not a useful thing for it to mean.
 */
export function createIdFactory(prefix: string): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
  };
}