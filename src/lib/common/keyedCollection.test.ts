// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createIdFactory, isStorageAvailable, keyedCollection } from './keyedCollection';

interface Entry {
  id: string;
  name: string;
}

function parseEntry(raw: unknown): Entry | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || obj.id.length === 0) return null;
  if (typeof obj.name !== 'string') return null;
  return { id: obj.id, name: obj.name.trim() };
}

function makeCollection(overrides: Partial<Parameters<typeof keyedCollection<Entry>>[0]> = {}) {
  return keyedCollection<Entry>({
    storageKey: 'test-collection',
    parseEntry,
    ...overrides,
  });
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('keyedCollection', () => {
  it('reports storage availability', () => {
    expect(isStorageAvailable()).toBe(true);
  });

  describe('read', () => {
    it('returns an empty array when the key is absent', () => {
      expect(makeCollection().read()).toEqual([]);
    });

    it('normalises every entry through parseEntry', () => {
      window.localStorage.setItem(
        'test-collection',
        JSON.stringify([{ id: 'a', name: '  spaced  ' }]),
      );
      expect(makeCollection().read()).toEqual([{ id: 'a', name: 'spaced' }]);
    });

    it('drops entries the validator rejects instead of failing the read', () => {
      window.localStorage.setItem(
        'test-collection',
        JSON.stringify([null, 'string', { name: 'no id' }, { id: 'ok', name: 'yes' }]),
      );
      expect(makeCollection().read()).toEqual([{ id: 'ok', name: 'yes' }]);
    });

    it('returns an empty array for a non-array payload', () => {
      window.localStorage.setItem('test-collection', JSON.stringify({ not: 'an array' }));
      expect(makeCollection().read()).toEqual([]);
    });

    it('returns an empty array for corrupt JSON and leaves the bytes alone', () => {
      window.localStorage.setItem('test-collection', 'invalid-json-{');
      expect(makeCollection().read()).toEqual([]);
      expect(window.localStorage.getItem('test-collection')).toBe('invalid-json-{');
    });

    it('survives a throwing getItem', () => {
      vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
        throw new Error('private mode');
      });
      expect(makeCollection().read()).toEqual([]);
    });

    it('caps reads at maxEntries', () => {
      const entries = Array.from({ length: 10 }, (_, i) => ({ id: `id-${i}`, name: `n-${i}` }));
      window.localStorage.setItem('test-collection', JSON.stringify(entries));
      expect(makeCollection({ maxEntries: 3 }).read()).toHaveLength(3);
    });

    it('returns everything when no cap is configured', () => {
      const entries = Array.from({ length: 250 }, (_, i) => ({ id: `id-${i}`, name: `n-${i}` }));
      window.localStorage.setItem('test-collection', JSON.stringify(entries));
      expect(makeCollection().read()).toHaveLength(250);
    });

    it('degrades to an empty collection when there is no window', () => {
      vi.stubGlobal('window', undefined);
      try {
        expect(makeCollection().read()).toEqual([]);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('write', () => {
    it('returns exactly what it stored', () => {
      const collection = makeCollection();
      const written = collection.write([{ id: 'a', name: 'A' }]);
      expect(written).toEqual([{ id: 'a', name: 'A' }]);
      expect(collection.read()).toEqual([{ id: 'a', name: 'A' }]);
    });

    it('caps writes and stores the capped list, not the input', () => {
      const entries = Array.from({ length: 10 }, (_, i) => ({ id: `id-${i}`, name: `n-${i}` }));
      const collection = makeCollection({ maxEntries: 4 });
      expect(collection.write(entries)).toHaveLength(4);
      expect(collection.read()).toHaveLength(4);
    });

    it('still returns the in-memory list when setItem throws', () => {
      vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
        throw new Error('quota');
      });
      const written = makeCollection().write([{ id: 'a', name: 'A' }]);
      expect(written).toEqual([{ id: 'a', name: 'A' }]);
    });

    it('persists an empty array by default', () => {
      const collection = makeCollection();
      collection.write([{ id: 'a', name: 'A' }]);
      collection.write([]);
      expect(window.localStorage.getItem('test-collection')).toBe('[]');
      expect(collection.read()).toEqual([]);
    });

    it('removes the key instead when removeWhenEmpty is set', () => {
      const collection = makeCollection({ removeWhenEmpty: true });
      collection.write([{ id: 'a', name: 'A' }]);
      collection.write([]);
      expect(window.localStorage.getItem('test-collection')).toBeNull();
    });
  });

  describe('clear', () => {
    it('removes the key', () => {
      const collection = makeCollection();
      collection.write([{ id: 'a', name: 'A' }]);
      collection.clear();
      expect(window.localStorage.getItem('test-collection')).toBeNull();
      expect(collection.read()).toEqual([]);
    });

    it('does not throw when removeItem throws', () => {
      vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => {
        throw new Error('quota');
      });
      expect(() => makeCollection().clear()).not.toThrow();
    });
  });
});

describe('createIdFactory', () => {
  it('prefixes ids and never repeats one within a factory', () => {
    const nextId = createIdFactory('folder');
    const ids = new Set(Array.from({ length: 500 }, () => nextId()));
    expect(ids.size).toBe(500);
    expect([...ids].every((id) => id.startsWith('folder-'))).toBe(true);
  });

  it('gives each factory its own counter, so collections cannot consume each other', () => {
    // Two factories' first ids carry the same counter component. Under a shared
    // module-level counter the second would read '2', which would make the
    // component mean "how many ids the whole app has issued" instead of "how
    // many this collection has issued".
    const a = createIdFactory('a');
    const b = createIdFactory('b');
    expect(a().split('-')[2]).toBe('1');
    expect(b().split('-')[2]).toBe('1');
  });
});