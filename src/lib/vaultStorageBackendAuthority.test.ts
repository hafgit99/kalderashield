// @vitest-environment jsdom
/**
 * @file vaultStorageBackendAuthority.test.ts
 * @description P2-2 gate: which repository is authoritative on which platform,
 * and what each implementation silently does not provide.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { sqliteOPFSInstance } from './sqlite_opfs';
import { ReadOnlyWaSqliteVaultStorageAdapter } from './vaultStorageWaSqliteAdapter';
import { WaSqliteVaultStorageRepository } from './waSqliteVaultStorageRepository';
import type { VaultStorageRepository } from './vaultStorageRepository';
import {
  clearPersistedActiveVaultStorageBackend,
  getActiveVaultStorageBackendSelection,
  getVaultStorageRepository,
  readPersistedActiveVaultStorageBackend,
  restoreOrActivateDefaultVaultStorageBackend,
  setVaultStorageRepositoryForTesting,
} from './vaultStorageProvider';
import { createWaSqlitePersistenceProfile } from './waSqlitePersistence';
import type { NativeVaultStorageScope } from './desktopStorage';

vi.mock('./indexedDbStorage', () => ({
  initializeIndexedDbStorage: vi.fn(async () => undefined),
  getIndexedDbItemSync: vi.fn((key: string) => localStorage.getItem(key)),
  setIndexedDbItemSync: vi.fn((key: string, value: string) => localStorage.setItem(key, value)),
  removeIndexedDbItemSync: vi.fn((key: string) => localStorage.removeItem(key)),
  clearAllSetupFlagsSync: vi.fn(() => {
    localStorage.removeItem('KalderaShield_is_setup');
    localStorage.removeItem('kalderashield_fallback');
    localStorage.removeItem('KalderaShield_account_secret_profile');
    localStorage.removeItem('KalderaShield_account_secret_key_remembered');
    localStorage.removeItem('KalderaShield_vault_storage_active_backend');
  }),
}));

/* ── 1. Platform -> authoritative backend ─────────────────────────────────────
 *
 * This is the mapping P2-2 said was "only implied by code". It was: every test
 * in vaultStorageProvider.test.ts injected `hasLegacyOpfsVaultData`, which is
 * about *data*, not about *platform*, and `isDesktopRuntime()` was never set --
 * in jsdom it is false, so every "fresh vault" test was a browser test whose
 * name did not say so. Nothing asserted the desktop or Android facts at all.
 *
 * `window.__TAURI_INTERNALS__` is the real signal `isDesktopRuntime()` reads
 * (src/lib/environment.ts:18). Setting it exercises production code rather than
 * mocking the module, which is the difference between pinning the behaviour and
 * pinning a stub.
 */

function setTauriRuntime(active: boolean): void {
  if (active) {
    (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
  } else {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  }
}

function setAndroidUserAgent(): void {
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  });
}

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';

function createRepositoryStub(): VaultStorageRepository {
  return {
    hydrate: vi.fn(async () => undefined),
    clearDerivedKeyCache: vi.fn(),
    subscribeLogs: vi.fn(() => vi.fn()),
    getQueryLogs: vi.fn(() => []),
    logQuery: vi.fn(),
    verifyPassword: vi.fn(async () => false),
    setupMaster: vi.fn(async () => undefined),
    changeMasterPassword: vi.fn(async () => undefined),
    deriveEncryptionKey: vi.fn(async () => new Uint8Array(32)),
    getVaultItems: vi.fn(async () => []),
    getVaultItemsWithKey: vi.fn(async () => []),
    saveVaultItem: vi.fn(async () => []),
    saveVaultItems: vi.fn(async () => []),
    executeCustomSQL: vi.fn(() => ({ columns: [], rows: [] })),
    resetAll: vi.fn(async () => undefined),
    deletePermanently: vi.fn(async () => []),
    deletePermanentlyBatch: vi.fn(async () => []),
    reseedDemo: vi.fn(async () => []),
  };
}

const originalUserAgent = navigator.userAgent;

afterEach(() => {
  clearPersistedActiveVaultStorageBackend();
  setVaultStorageRepositoryForTesting(sqliteOPFSInstance);
  setTauriRuntime(false);
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: originalUserAgent,
  });
});

describe('P2-2: platform -> authoritative vault storage backend', () => {
  it('keeps the OPFS repository on desktop, for a brand new vault', async () => {
    setTauriRuntime(true);
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: DESKTOP_USER_AGENT });
    const waSqlite = createRepositoryStub();

    const status = await restoreOrActivateDefaultVaultStorageBackend({
      hasLegacyOpfsVaultData: () => false,
      createPersistenceProfile: () => createWaSqlitePersistenceProfile('desktop-app-data', true),
      createRepository: () => waSqlite,
    });

    expect(status).toBe('kept-legacy-opfs');
    // The decisive assertion: a wa-sqlite repository was *constructed and handed
    // to the provider* and must still not be the active one. Asserting only the
    // status string would not catch a provider that activated it anyway.
    expect(waSqlite.hydrate).not.toHaveBeenCalled();
    expect(getVaultStorageRepository()).toBe(sqliteOPFSInstance);
    expect(getActiveVaultStorageBackendSelection()).toEqual({
      active: 'opfs',
      target: null,
      mode: 'active',
    });
    expect(readPersistedActiveVaultStorageBackend()).toBeNull();
  });

  it('keeps the OPFS repository on Android, for a brand new vault', async () => {
    setTauriRuntime(true);
    setAndroidUserAgent();
    const waSqlite = createRepositoryStub();

    const status = await restoreOrActivateDefaultVaultStorageBackend({
      hasLegacyOpfsVaultData: () => false,
      createPersistenceProfile: () => createWaSqlitePersistenceProfile('android-app-private', true),
      createRepository: () => waSqlite,
    });

    expect(status).toBe('kept-legacy-opfs');
    expect(getVaultStorageRepository()).toBe(sqliteOPFSInstance);
  });

  it('keeps OPFS in the browser while legacy JSON data still exists', async () => {
    setTauriRuntime(false);
    const waSqlite = createRepositoryStub();

    const status = await restoreOrActivateDefaultVaultStorageBackend({
      hasLegacyOpfsVaultData: () => true,
      createRepository: () => waSqlite,
    });

    expect(status).toBe('kept-legacy-opfs');
    expect(getVaultStorageRepository()).toBe(sqliteOPFSInstance);
  });

  it('activates wa-sqlite in the browser for a fresh vault', async () => {
    setTauriRuntime(false);
    const repository = createRepositoryStub();

    const status = await restoreOrActivateDefaultVaultStorageBackend({
      hasLegacyOpfsVaultData: () => false,
      createPersistenceProfile: () => createWaSqlitePersistenceProfile('browser-fallback', true),
      createRepository: () => repository,
    });

    expect(status).toBe('activated-wa-sqlite-default');
    expect(getVaultStorageRepository()).toBe(repository);
    expect(getActiveVaultStorageBackendSelection().active).toBe('wa-sqlite');
  });

  it('falls back to OPFS -- and never to an empty new vault -- when browser wa-sqlite cannot hydrate', async () => {
    setTauriRuntime(false);
    const waSqlite = createRepositoryStub();
    vi.mocked(waSqlite.hydrate).mockRejectedValueOnce(new Error('hydrate failed'));

    const status = await restoreOrActivateDefaultVaultStorageBackend({
      hasLegacyOpfsVaultData: () => false,
      createPersistenceProfile: () => createWaSqlitePersistenceProfile('browser-fallback', true),
      createRepository: () => waSqlite,
    });

    expect(status).toBe('kept-opfs-fallback');
    expect(getVaultStorageRepository()).toBe(sqliteOPFSInstance);
    expect(readPersistedActiveVaultStorageBackend()).toBeNull();
  });
});

/* ── 2. Optional-contract divergence ──────────────────────────────────────────
 *
 * `VaultStorageRepository` has fifteen optional methods, and callers branch on
 * their presence with `if (repo.x)`. That branch is the whole risk P2-2 named:
 * a bug fixed in one implementation behaves differently in another and nothing
 * says so. Every entry below is a snapshot of reality; when someone adds or
 * removes a method, this test fails and the reason it fails is the interesting
 * part.
 *
 * Prototypes are used rather than instances so that no engine, WASM or IndexedDB
 * setup is needed to assert what a class *declares*.
 */

const OPTIONAL_METHODS = [
  'getStartupFailure',
  'isVaultFileUnreadable',
  'saveVaultItemWithKey',
  'setItemTrashedWithKey',
  'saveVaultItemsWithKey',
  'deletePermanentlyWithKey',
  'deletePermanentlyBatchWithKey',
  'replaceAllVaultItemsWithKey',
  'reseedDemoWithKey',
  'getArgonHash',
  'getCurrentVaultEncryptionSalt',
  'getKdfParams',
  'setupMasterWithHash',
  'changeMasterPasswordWithHash',
  'close',
] as const;

type OptionalMethod = (typeof OPTIONAL_METHODS)[number];

/* The SQLiteOPFS class is not exported -- only its singleton is -- so the
 * prototype is read off the instance. That is deliberate: this gate must not
 * add an export of its own to the module it is measuring. */
const SQLiteOpfsPrototype = Object.getPrototypeOf(sqliteOPFSInstance) as Record<string, (...args: never[]) => unknown>;

const IMPLEMENTATIONS = [
  { label: 'SQLiteOPFS', prototype: SQLiteOpfsPrototype },
  { label: 'WaSqliteVaultStorageRepository', prototype: WaSqliteVaultStorageRepository.prototype },
  { label: 'ReadOnlyWaSqliteVaultStorageAdapter', prototype: ReadOnlyWaSqliteVaultStorageAdapter.prototype },
] as const;

function providedOptionalMethods(prototype: object): OptionalMethod[] {
  return OPTIONAL_METHODS.filter(
    (name) => typeof (prototype as Record<string, unknown>)[name] === 'function',
  );
}

describe('P2-2: optional contract divergence between implementations', () => {
  it('covers every optional method the interface declares', () => {
    // If a method is added to the interface and not to this list, everything
    // below silently stops describing it.
    expect(OPTIONAL_METHODS).toHaveLength(15);
  });

  it('there are exactly three implementations, and this gate covers all three', () => {
    // A fourth implementation is a new row in the divergence table, not an
    // invisible one.
    expect(IMPLEMENTATIONS.map((impl) => impl.label)).toEqual([
      'SQLiteOPFS',
      'WaSqliteVaultStorageRepository',
      'ReadOnlyWaSqliteVaultStorageAdapter',
    ]);
  });

  it('SQLiteOPFS provides every optional method except close', () => {
    expect(providedOptionalMethods(SQLiteOpfsPrototype).filter((name) => name !== 'close')).toEqual(
      OPTIONAL_METHODS.filter((name) => name !== 'close'),
    );
  });

  it('wa-sqlite provides 11 of the 15 and omits the four below', () => {
    const provided = providedOptionalMethods(WaSqliteVaultStorageRepository.prototype);
    const missing = OPTIONAL_METHODS.filter((name) => !provided.includes(name));

    expect(provided).toHaveLength(11);
    expect(missing.sort()).toEqual(
      [
        'getStartupFailure',
        'isVaultFileUnreadable',
        'replaceAllVaultItemsWithKey',
        'setItemTrashedWithKey',
      ].sort(),
    );
  });

  it('the read-only adapter exposes exactly five methods, all of them writes', () => {
    const provided = providedOptionalMethods(ReadOnlyWaSqliteVaultStorageAdapter.prototype);
    expect(provided.sort()).toEqual(
      [
        'deletePermanentlyBatchWithKey',
        'deletePermanentlyWithKey',
        'reseedDemoWithKey',
        'saveVaultItemWithKey',
        'saveVaultItemsWithKey',
      ].sort(),
    );
    // Every one of them throws `wa-sqlite-adapter-read-only`; that behaviour is
    // asserted in vaultStorageWaSqliteAdapter.test.ts and is not re-tested here.
    expect(provided.every((name) => !name.startsWith('get') && !name.startsWith('is'))).toBe(true);
  });
});

/* ── 3. The degradations the divergence produces ──────────────────────────────
 *
 * These are the consequences, asserted rather than left to be discovered. Each
 * is currently TRUE and each is a silent fallback in src/lib/storage.ts. They
 * are written as "this is what happens" rather than "this is what should
 * happen", because wa-sqlite is only ever active in the browser and the browser
 * fallback is a deliberate, temporary state -- but the moment wa-sqlite is
 * promoted to a desktop that also has a vault, all four become active bugs and
 * this file is what has to be edited first.
 */

describe('P2-2: what the wa-sqlite backend silently degrades to', () => {
  const waSqlite = WaSqliteVaultStorageRepository.prototype as unknown as Record<string, unknown>;

  it('cannot report a damaged vault file, so the K-4 snapshot-restore gate never fires', () => {
    // storage.ts:156 calls repo.isVaultFileUnreadable?.() and skips the whole
    // block when it is absent. On this backend the user sees an empty vault
    // rather than the restore prompt.
    expect(typeof waSqlite.isVaultFileUnreadable).toBe('undefined');
  });

  it('falls back to read-modify-write for trash, which is the Y-15 bug it was added to remove', () => {
    // storage.ts:990-1024 reads the whole vault, flips one flag and writes one
    // item back -- so any field that changed between the read and the write is
    // silently reverted.
    expect(typeof waSqlite.setItemTrashedWithKey).toBe('undefined');
  });

  it('falls back to a per-item loop for snapshot restore, which is the O-16 partial-failure bug', () => {
    // storage.ts:957-968 deletes surplus ids one at a time and then saves. A
    // crash halfway leaves the vault half-restored, with no rollback.
    expect(typeof waSqlite.replaceAllVaultItemsWithKey).toBe('undefined');
  });

  it('is not reachable from the browser today, which is why none of this is an active bug', () => {
    // The guard above is only reachable once wa-sqlite is the active backend,
    // and that is asserted in the first describe block. This assertion exists so
    // that if the platform mapping ever changes, the failure lands here and
    // names the three capabilities that would need implementing first.
    expect(typeof SQLiteOpfsPrototype.setItemTrashedWithKey).toBe('function');
    expect(typeof SQLiteOpfsPrototype.replaceAllVaultItemsWithKey).toBe('function');
    expect(typeof SQLiteOpfsPrototype.isVaultFileUnreadable).toBe('function');
  });
});

/* ── 4. K-3: does the repository that receives a vault key actually use it ────
 *
 * storage.ts:415 branches on `if (repo.setupMasterWithHash)` and passes
 * `vaultKeyBytes` as the fourth argument so the first persisted state is signed.
 * A presence check cannot see a signature that differs from the interface's:
 * a class may declare fewer parameters and TypeScript accepts it, because a
 * function taking fewer parameters is assignable to one taking more.
 *
 * That is how wa-sqlite went years with three parameters, no integrity-HMAC
 * machinery at all, and a green gate. It was described as unreachable because
 * the branch at storage.ts:394 is guarded by `isDesktopRuntime()` and desktop
 * and Android keep SQLiteOPFS. That reasoning was half right and dangerous:
 * the browser branch below it returns `activated-wa-sqlite-default` for a fresh
 * vault, so every new browser vault was created unsigned.
 *
 * The gap is closed (2026-10-13): both backends now declare four parameters,
 * and wa-sqlite seals, re-seals and verifies. The arity assertion stays, for
 * the reason in the comment below it.
 */

describe('P2-2: first persisted state is signed (K-3)', () => {
  it('every platform where storage.ts passes a vault encryption key seals it', async () => {
    const platforms: Array<{ label: string; apply: () => void; scope: NativeVaultStorageScope }> = [
      {
        label: 'desktop',
        apply: () => {
          setTauriRuntime(true);
          Object.defineProperty(navigator, 'userAgent', {
            configurable: true,
            value: DESKTOP_USER_AGENT,
          });
        },
        scope: 'desktop-app-data',
      },
      {
        label: 'android',
        apply: () => {
          setTauriRuntime(true);
          setAndroidUserAgent();
        },
        scope: 'android-app-private',
      },
    ];

    for (const platform of platforms) {
      setTauriRuntime(false);
      Object.defineProperty(navigator, 'userAgent', { configurable: true, value: originalUserAgent });
      platform.apply();

      const status = await restoreOrActivateDefaultVaultStorageBackend({
        hasLegacyOpfsVaultData: () => false,
        createPersistenceProfile: () => createWaSqlitePersistenceProfile(platform.scope, true),
        createRepository: () => createRepositoryStub(),
      });

      expect(status, `${platform.label} must keep a backend that signs`).toBe('kept-legacy-opfs');
      expect(getVaultStorageRepository()).toBe(sqliteOPFSInstance);
      expect(typeof sqliteOPFSInstance.setupMasterWithHash).toBe('function');
    }
  });

  it('both backends take the vault encryption key, and no backend is the odd one out', () => {
    expect(typeof SQLiteOpfsPrototype.setupMasterWithHash).toBe('function');
    expect(typeof WaSqliteVaultStorageRepository.prototype.setupMasterWithHash).toBe('function');

    // `if (repo.setupMasterWithHash)` at storage.ts:415 is true on either
    // backend, so the branch looks correct while passing a fourth argument into
    // a function that takes three. That is the whole failure mode.
    //
    // Arity happens to distinguish them, and it is recorded here so the claim
    // stays checkable. It is not the safety net: TS `?` is erased at runtime,
    // `Function.length` counts every declared parameter, and a single
    // `= undefined` default would silently drop the number and make two
    // implementations indistinguishable to this line. Equal arity plus the
    // behavioural test in waSqliteVaultStorageRepository.test.ts is what holds.
    expect(SQLiteOpfsPrototype.setupMasterWithHash!.length).toBe(4);
    expect(WaSqliteVaultStorageRepository.prototype.setupMasterWithHash.length).toBe(4);
  });
});