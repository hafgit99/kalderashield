/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { resolveLWWConflicts, buildSyncEnvelope, parseSyncEnvelope, performSync } from './syncEngine';
import type { SyncProvider, SyncRemoteMetadata } from './syncTypes';
import { SyncError, syncErrorCodes } from './syncTypes';
import type { VaultItem } from '../../types';

// Mock argon2id so tests don't need WASM
vi.mock('../argon2id', () => ({
  deriveArgon2idKey: vi.fn(async (password: string) => {
    const key = new Uint8Array(32);
    for (let i = 0; i < key.length; i++) {
      key[i] = password.charCodeAt(i % password.length) & 0xff;
    }
    return key;
  }),
  MIN_ARGON2ID_MEMORY_KIB: 8192,
  enforceMinimumKdfFloor: (opts: any) => ({ memoryKiB: 32768, iterations: 3, parallelism: 1, hashLength: 32, ...opts }),
}));



// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(id: string, updatedAt: string, extra: Partial<VaultItem> = {}): VaultItem {
  return {
    id,
    title: `Item ${id}`,
    username: 'user',
    url: 'https://example.com',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt,
    category: 'login',
    ...extra,
  };
}

const MASTER_PW = 'TestMasterPassword123!';

// ─── LWW Conflict Resolution Tests ───────────────────────────────────────────

describe('resolveLWWConflicts', () => {
  it('keeps local item when local is newer', () => {
    const local = [makeItem('a', '2024-06-01T12:00:00Z', { title: 'Local Title' })];
    const remote = [makeItem('a', '2024-06-01T10:00:00Z', { title: 'Remote Title' })];
    const { merged, conflicts } = resolveLWWConflicts(local, remote);
    expect(merged.find(i => i.id === 'a')!.title).toBe('Local Title');
    expect(conflicts).toHaveLength(0);
  });

  it('adopts remote item when remote is newer', () => {
    const local = [makeItem('a', '2024-06-01T10:00:00Z', { title: 'Local Title' })];
    const remote = [makeItem('a', '2024-06-01T12:00:00Z', { title: 'Remote Title' })];
    const { merged, conflicts } = resolveLWWConflicts(local, remote);
    expect(merged.find(i => i.id === 'a')!.title).toBe('Remote Title');
    expect(conflicts).toHaveLength(0);
  });

  it('adds remote-only items to local', () => {
    const local = [makeItem('a', '2024-06-01T10:00:00Z')];
    const remote = [makeItem('b', '2024-06-01T11:00:00Z', { title: 'Remote Only' })];
    const { merged } = resolveLWWConflicts(local, remote);
    expect(merged).toHaveLength(2);
    expect(merged.find(i => i.id === 'b')?.title).toBe('Remote Only');
  });

  it('keeps local-only items untouched', () => {
    const local = [makeItem('a', '2024-06-01T10:00:00Z'), makeItem('b', '2024-06-01T11:00:00Z')];
    const remote = [makeItem('a', '2024-06-01T09:00:00Z')];
    const { merged } = resolveLWWConflicts(local, remote);
    expect(merged).toHaveLength(2);
    expect(merged.find(i => i.id === 'b')).toBeDefined();
  });

  it('flags near-simultaneous writes as conflicts', () => {
    const local = [makeItem('a', '2024-06-01T10:00:00.000Z', { title: 'Local' })];
    // 2 seconds later — under the 5s threshold
    const remote = [makeItem('a', '2024-06-01T10:00:02.000Z', { title: 'Remote' })];
    const { merged, conflicts } = resolveLWWConflicts(local, remote);
    expect(merged.find(i => i.id === 'a')!.title).toBe('Remote'); // remote wins
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.id).toBe('a');
  });

  it('does not flag conflicts for writes > 5s apart', () => {
    const local = [makeItem('a', '2024-06-01T10:00:00.000Z', { title: 'Local' })];
    const remote = [makeItem('a', '2024-06-01T10:00:10.000Z', { title: 'Remote' })];
    const { conflicts } = resolveLWWConflicts(local, remote);
    expect(conflicts).toHaveLength(0);
  });

  it('handles tombstone items correctly (deleted flag propagated)', () => {
    const local = [makeItem('a', '2024-06-01T10:00:00Z')];
    const remote = [makeItem('a', '2024-06-01T12:00:00Z', { deleted: true, deletedAt: '2024-06-01T12:00:00Z' })];
    const { merged } = resolveLWWConflicts(local, remote);
    expect(merged.find(i => i.id === 'a')?.deleted).toBe(true);
  });

  it('handles empty inputs gracefully', () => {
    expect(resolveLWWConflicts([], []).merged).toHaveLength(0);
    const local = [makeItem('a', '2024-01-01T00:00:00Z')];
    expect(resolveLWWConflicts(local, []).merged).toHaveLength(1);
    expect(resolveLWWConflicts([], local).merged).toHaveLength(1);
  });
});

// ─── Envelope Round-Trip Tests ────────────────────────────────────────────────

describe('buildSyncEnvelope / parseSyncEnvelope', () => {
  const items: VaultItem[] = [
    makeItem('x1', '2024-01-01T00:00:00Z', { title: 'Login A', password: 's3cr3t!' }),
    makeItem('x2', '2024-01-02T00:00:00Z', { title: 'Login B', username: 'bob' }),
  ];

  it('produces a valid JSON envelope and recovers items', async () => {
    const { encryptedBlob, metadata } = await buildSyncEnvelope(items, MASTER_PW);
    expect(typeof encryptedBlob).toBe('string');
    expect(metadata.itemCount).toBe(2);
    expect(metadata.checksum).toHaveLength(64); // SHA-256 hex

    const recovered = await parseSyncEnvelope(encryptedBlob, MASTER_PW, metadata.checksum);
    expect(recovered).toHaveLength(2);
    expect(recovered.find(i => i.id === 'x1')?.password).toBe('s3cr3t!');
  });

  it('uses the newest item timestamp as remote metadata freshness', async () => {
    const { metadata } = await buildSyncEnvelope(items, MASTER_PW);

    expect(metadata.updatedAt).toBe('2024-01-02T00:00:00.000Z');
  });

  it('rejects wrong password', async () => {
    const { encryptedBlob } = await buildSyncEnvelope(items, MASTER_PW);
    await expect(parseSyncEnvelope(encryptedBlob, 'WrongPassword999!')).rejects.toThrow();
  });

  it('rejects mismatched checksum', async () => {
    const { encryptedBlob } = await buildSyncEnvelope(items, MASTER_PW);
    await expect(
      parseSyncEnvelope(encryptedBlob, MASTER_PW, 'a'.repeat(64)),
    ).rejects.toThrow(/checksum/i);
  });
});

// ─── performSync Integration Tests ───────────────────────────────────────────

describe('performSync', () => {
  const makeProvider = (overrides: Partial<SyncProvider> = {}): SyncProvider => ({
    uploadVault: vi.fn().mockResolvedValue(undefined),
    downloadVault: vi.fn().mockResolvedValue(null),
    getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'absent' } as SyncRemoteMetadata),
    testConnection: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  it('uploads local items when no remote exists', async () => {
    const provider = makeProvider();
    const localItems = [makeItem('a', '2024-01-01T00:00:00Z')];
    const result = await performSync(provider, localItems, MASTER_PW);
    expect(result.status).toBe('success');
    expect(provider.uploadVault).toHaveBeenCalledOnce();
    expect(result.mergedItems).toHaveLength(1);
  });

  it('merges remote items when remote is available', async () => {
    const remoteItem = makeItem('b', '2024-06-01T12:00:00Z', { title: 'Remote Item' });
    const { encryptedBlob, metadata } = await buildSyncEnvelope([remoteItem], MASTER_PW);

    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'ok', metadata } as SyncRemoteMetadata),
      downloadVault: vi.fn().mockResolvedValue(encryptedBlob),
    });

    const localItems = [makeItem('a', '2024-01-01T00:00:00Z', { title: 'Local Item' })];
    const result = await performSync(provider, localItems, MASTER_PW);

    expect(result.status).toBe('success');
    expect(result.mergedItems).toHaveLength(2);
    expect(result.mergedItems?.find(i => i.id === 'b')?.title).toBe('Remote Item');
  });

  it('returns error status on upload failure', async () => {
    const provider = makeProvider({
      uploadVault: vi.fn().mockRejectedValue(new Error('HTTP 503')),
    });
    const result = await performSync(provider, [], MASTER_PW);
    expect(result.status).toBe('error');
    expect(result.error).toBeDefined();
  });

  it('returns error status on download failure', async () => {
    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({
        kind: 'ok',
        metadata: {
          updatedAt: '2099-01-01T00:00:00Z', // future — triggers download
          deviceId: 'remote-device',
          vaultVersion: '7.0',
          checksum: 'a'.repeat(64),
          itemCount: 1,
        },
      } as SyncRemoteMetadata),
      downloadVault: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    const result = await performSync(provider, [], MASTER_PW);
    expect(result.status).toBe('error');
  });

  it('returns conflict status on near-simultaneous writes', async () => {
    const now = new Date();
    const oneSecondAgo = new Date(now.getTime() - 1000);
    const localItems = [makeItem('a', now.toISOString(), { title: 'Local' })];
    const remoteItems = [makeItem('a', oneSecondAgo.toISOString(), { title: 'Remote Older' })];
    // Make remote item have a slightly newer timestamp than local for conflict
    remoteItems[0]!.updatedAt = new Date(now.getTime() + 500).toISOString();
    remoteItems[0]!.title = 'Remote Newer';

    const { encryptedBlob, metadata } = await buildSyncEnvelope(remoteItems, MASTER_PW);
    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'ok', metadata } as SyncRemoteMetadata),
      downloadVault: vi.fn().mockResolvedValue(encryptedBlob),
    });

    const result = await performSync(provider, localItems, MASTER_PW);
    expect(result.status).toBe('conflict');
    expect(result.conflicts?.length).toBeGreaterThan(0);
  });

  it('handles corrupted remote envelope and items without updatedAt', async () => {
    // 1. Corrupted remote envelope (triggers parseSyncEnvelope generic error)
    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({
        kind: 'ok',
        metadata: {
          updatedAt: '2099-01-01T00:00:00Z',
          deviceId: 'remote-device',
          vaultVersion: '7.0',
          checksum: 'a'.repeat(64),
          itemCount: 1,
        },
      } as SyncRemoteMetadata),
      downloadVault: vi.fn().mockResolvedValue('invalid-envelope-not-json'),
    });

    const localItemWithoutUpdatedAt: any = {
      id: 'a',
      title: 'Item A',
      username: 'user',
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const result = await performSync(provider, [localItemWithoutUpdatedAt], MASTER_PW);
    expect(result.status).toBe('error');
  });
});

// ─── Y-11: Never Overwrite An Unknown Remote ─────────────────────────────────

describe('Y-11 remote overwrite protection', () => {
  const makeProvider = (overrides: Partial<SyncProvider> = {}): SyncProvider => ({
    uploadVault: vi.fn().mockResolvedValue(undefined),
    downloadVault: vi.fn().mockResolvedValue(null),
    getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'absent' } as SyncRemoteMetadata),
    testConnection: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const unreadable = (): SyncRemoteMetadata => ({
    kind: 'unreadable',
    detail: 'metadata.json is present but not parsable: Unexpected token',
  });

  it('refuses to upload when remote metadata is unreadable', async () => {
    // The core Y-11 regression. A failed metadata PUT leaves an intact vault
    // blob with no readable descriptor. Reporting that as "no remote" and then
    // uploading destroyed the user's only off-device backup while reporting
    // success.
    const provider = makeProvider({ getRemoteMetadata: vi.fn().mockResolvedValue(unreadable()) });
    const localItems = [makeItem('local', '2024-06-01T12:00:00Z')];

    const result = await performSync(provider, localItems, MASTER_PW);

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe(syncErrorCodes.remoteStateUnknown);
    // The critical assertion: nothing was written.
    expect(provider.uploadVault).not.toHaveBeenCalled();
    expect(result.mergedItems).toEqual(localItems);
  });

  it('does not download the remote blob when metadata is unreadable', async () => {
    // The blob may well be intact; downloading it blind would be an option,
    // but uploading over it is not.
    const provider = makeProvider({ getRemoteMetadata: vi.fn().mockResolvedValue(unreadable()) });

    await performSync(provider, [makeItem('a', '2024-06-01T12:00:00Z')], MASTER_PW);

    expect(provider.downloadVault).not.toHaveBeenCalled();
  });

  it('uploads on a genuine first sync (remote absent)', async () => {
    const provider = makeProvider({ getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'absent' } as SyncRemoteMetadata) });

    const result = await performSync(provider, [makeItem('a', '2024-06-01T12:00:00Z')], MASTER_PW);

    expect(result.status).toBe('success');
    expect(provider.uploadVault).toHaveBeenCalledOnce();
  });

  it('replays the observed ETag as a write precondition', async () => {
    const remoteItem = makeItem('b', '2024-06-01T12:00:00Z');
    const { encryptedBlob, metadata } = await buildSyncEnvelope([remoteItem], MASTER_PW);
    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'ok', metadata, etag: '"v1"' } as SyncRemoteMetadata),
      downloadVault: vi.fn().mockResolvedValue(encryptedBlob),
    });

    await performSync(provider, [makeItem('a', '2024-01-01T00:00:00Z')], MASTER_PW);

    expect(provider.uploadVault).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      { ifMatch: '"v1"' },
    );
  });

  it('sends no precondition on first sync, so a fresh remote is not rejected', async () => {
    const provider = makeProvider({ getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'absent' } as SyncRemoteMetadata) });

    await performSync(provider, [makeItem('a', '2024-06-01T12:00:00Z')], MASTER_PW);

    const call = (provider.uploadVault as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[2]?.ifMatch).toBeUndefined();
  });

  it('surfaces a rejected conditional write without reporting success', async () => {
    const { metadata } = await buildSyncEnvelope([makeItem('b', '2024-06-01T12:00:00Z')], MASTER_PW);
    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'ok', metadata, etag: '"v1"' } as SyncRemoteMetadata),
      downloadVault: vi.fn().mockResolvedValue(null),
      uploadVault: vi.fn().mockRejectedValue(
        new SyncError(syncErrorCodes.remoteModified, 'Remote vault changed during sync'),
      ),
    });

    const result = await performSync(provider, [makeItem('a', '2024-06-01T13:00:00Z')], MASTER_PW);

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe(syncErrorCodes.remoteModified);
  });

  it('reports the post-upload ETag, not the stale pre-upload one', async () => {
    const { metadata } = await buildSyncEnvelope([makeItem('b', '2024-06-01T12:00:00Z')], MASTER_PW);
    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'ok', metadata, etag: '"v1"' } as SyncRemoteMetadata),
      downloadVault: vi.fn().mockResolvedValue(null),
      getVaultETag: vi.fn().mockResolvedValue('"v2"'),
    });

    const result = await performSync(provider, [makeItem('a', '2024-06-01T13:00:00Z')], MASTER_PW);

    expect(result.uploadedETag).toBe('"v2"');
  });

  // ─── O-20 / O-21: untrusted remote bounds and shape ───────────────────────

  it('O-21: refuses to overwrite a remote whose metadata timestamp is unparsable', async () => {
    // The concrete data-loss path: an unparsable `updatedAt` becomes NaN, and
    // `NaN > x` is false, so sync concluded the remote was not newer, skipped the
    // download, and uploaded over it. A ~60-byte metadata file was enough.
    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({
        kind: 'ok',
        metadata: {
          updatedAt: 'not-a-date',
          deviceId: 'remote-device',
          vaultVersion: '7.0',
          checksum: 'a'.repeat(64),
          itemCount: 1,
        },
      } as SyncRemoteMetadata),
      downloadVault: vi.fn().mockResolvedValue(null),
    });

    const result = await performSync(provider, [makeItem('local', '2024-06-01T12:00:00Z')], MASTER_PW);

    // Whatever the outcome, the local state must not be written over a remote
    // whose freshness could not be established.
    expect(provider.uploadVault).not.toHaveBeenCalled();
    expect(result.status).toBe('error');
  });

  it('O-21: refuses when the remote metadata is missing required fields', async () => {
    for (const broken of [
      { updatedAt: '2026-06-01T12:00:00Z' },
      { updatedAt: '2026-06-01T12:00:00Z', deviceId: '', vaultVersion: '7.0', checksum: 'a'.repeat(64), itemCount: 1 },
      { updatedAt: '2026-06-01T12:00:00Z', deviceId: 'd', vaultVersion: '7.0', checksum: 'short', itemCount: 1 },
    ]) {
      const provider = makeProvider({
        getRemoteMetadata: vi.fn().mockResolvedValue({
          kind: 'unreadable',
          detail: 'metadata.json failed validation',
        } as SyncRemoteMetadata),
      });

      const result = await performSync(provider, [makeItem('local', '2024-06-01T12:00:00Z')], MASTER_PW);

      expect(provider.uploadVault, `for ${JSON.stringify(broken)}`).not.toHaveBeenCalled();
      expect(result.status).toBe('error');
    }
  });

  it('O-20: surfaces an oversized remote payload as an error', async () => {
    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({
        kind: 'ok',
        metadata: {
          updatedAt: '2099-01-01T00:00:00Z',
          deviceId: 'remote-device',
          vaultVersion: '7.0',
          checksum: 'a'.repeat(64),
          itemCount: 1,
        },
      } as SyncRemoteMetadata),
      downloadVault: vi.fn().mockRejectedValue(
        new SyncError(syncErrorCodes.remoteTooLarge, 'Remote vault snapshot exceeds the limit.'),
      ),
    });

    const result = await performSync(provider, [makeItem('local', '2024-06-01T12:00:00Z')], MASTER_PW);

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe(syncErrorCodes.remoteTooLarge);
    // A hostile remote must not cause a blind overwrite as an error response.
    expect(provider.uploadVault).not.toHaveBeenCalled();
  });
});

// ─── F-06: Rollback Protection & Non-Destructive Conflict Copies ────────────

describe('F-06 rollback-protected sync and conflict copies', () => {
  const makeProvider = (overrides: Partial<SyncProvider> = {}): SyncProvider => ({
    uploadVault: vi.fn().mockResolvedValue(undefined),
    downloadVault: vi.fn().mockResolvedValue(null),
    getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'absent' } as SyncRemoteMetadata),
    testConnection: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  it('embeds authenticated syncGeneration inside v2 sync envelopes and advances on upload', async () => {
    const remoteItem = makeItem('r1', '2026-06-01T12:00:00Z', { title: 'Gen 4 Remote' });
    const { encryptedBlob, metadata } = await buildSyncEnvelope([remoteItem], MASTER_PW, 4);
    expect(metadata.syncGeneration).toBe(4);

    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'ok', metadata } as SyncRemoteMetadata),
      downloadVault: vi.fn().mockResolvedValue(encryptedBlob),
    });

    const result = await performSync(provider, [], MASTER_PW, { lastVerifiedGeneration: 3 });
    expect(result.status).toBe('success');
    expect(result.syncGeneration).toBe(5);
    expect(provider.uploadVault).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ syncGeneration: 5 }),
      expect.any(Object),
    );
  });

  it('refuses sync when a compromised remote replays an older authenticated generation (rollback attack)', async () => {
    const staleRemote = await buildSyncEnvelope(
      [makeItem('old', '2026-06-01T12:00:00Z', { title: 'Stale Snapshot' })],
      MASTER_PW,
      2,
    );
    // Even if the hostile server lies in plaintext metadata.json and claims generation 9,
    // the AEAD-authenticated generation (2) inside the ciphertext catches the rollback.
    const forgedMetadata = {
      ...staleRemote.metadata,
      updatedAt: '2099-01-01T00:00:00Z',
      syncGeneration: 9,
    };

    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'ok', metadata: forgedMetadata } as SyncRemoteMetadata),
      downloadVault: vi.fn().mockResolvedValue(staleRemote.encryptedBlob),
    });

    const localItems = [makeItem('local', '2026-06-01T10:00:00Z', { title: 'Current Local' })];
    const result = await performSync(provider, localItems, MASTER_PW, { lastVerifiedGeneration: 5 });

    expect(result.status).toBe('error');
    expect(result.error?.code).toBe(syncErrorCodes.rollbackDetected);
    expect(provider.uploadVault).not.toHaveBeenCalled();
    expect(result.mergedItems).toEqual(localItems);
  });

  it('preserves a non-destructive conflict copy when near-simultaneous writes have different content', () => {
    const local = [makeItem('c1', '2026-06-01T10:00:00.000Z', { title: 'Bank', password: 'LocalPassword1!' })];
    const remote = [makeItem('c1', '2026-06-01T10:00:02.000Z', { title: 'Bank', password: 'RemotePassword2!' })];

    const { merged, conflicts, conflictCopies } = resolveLWWConflicts(local, remote);
    expect(merged.find((i) => i.id === 'c1')?.password).toBe('RemotePassword2!');
    expect(conflicts).toHaveLength(1);
    expect(conflictCopies).toHaveLength(1);
    expect(conflictCopies[0]?.password).toBe('LocalPassword1!');
    expect(conflictCopies[0]?.title).toContain('(Conflict Copy)');
  });

  it('uses getVaultETag (not metadata.json ETag) as If-Match precondition for uploadVault', async () => {
    const remoteItem = makeItem('b', '2026-06-01T12:00:00Z');
    const { encryptedBlob, metadata } = await buildSyncEnvelope([remoteItem], MASTER_PW);
    const getVaultETag = vi.fn()
      .mockResolvedValueOnce('"vault-etag-1"')
      .mockResolvedValueOnce('"vault-etag-2"');
    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({
        kind: 'ok',
        metadata,
        etag: '"metadata-etag-different"',
      } as SyncRemoteMetadata),
      getVaultETag,
      downloadVault: vi.fn().mockResolvedValue(encryptedBlob),
    });

    const result = await performSync(provider, [makeItem('a', '2026-01-01T00:00:00Z')], MASTER_PW, {
      lastVerifiedGeneration: 0,
    });

    expect(result.status).toBe('success');
    expect(provider.uploadVault).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      { ifMatch: '"vault-etag-1"' },
    );
    expect(result.uploadedETag).toBe('"vault-etag-2"');
  });

  it('includes conflictCopies in mergedItems so overwritten near-simultaneous edits are persisted locally and remotely', async () => {
    const localItem = makeItem('c1', '2026-06-01T10:00:00.000Z', { title: 'Bank', password: 'LocalPassword1!' });
    const remoteItem = makeItem('c1', '2026-06-01T10:00:02.000Z', { title: 'Bank', password: 'RemotePassword2!' });
    const { encryptedBlob, metadata } = await buildSyncEnvelope([remoteItem], MASTER_PW);
    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'ok', metadata } as SyncRemoteMetadata),
      downloadVault: vi.fn().mockResolvedValue(encryptedBlob),
    });

    const result = await performSync(provider, [localItem], MASTER_PW, { lastVerifiedGeneration: 0 });

    expect(result.status).toBe('conflict');
    expect(result.conflictCopies).toHaveLength(1);
    expect(result.mergedItems.some((i) => i.title.includes('(Conflict Copy)') && i.password === 'LocalPassword1!')).toBe(true);
    expect(result.mergedItems.some((i) => i.id === 'c1' && i.password === 'RemotePassword2!')).toBe(true);
  });

  it('downloads and merges an unseen snapshot from another device even if its timestamp is slightly older (clock skew)', async () => {
    const peerItem = makeItem('peer-1', '2026-06-01T10:02:00.000Z', { title: 'Peer Device Entry' });
    const { encryptedBlob, metadata } = await buildSyncEnvelope([peerItem], MASTER_PW, 1);
    const peerMetadata = { ...metadata, deviceId: 'different-peer-device' };
    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'ok', metadata: peerMetadata } as SyncRemoteMetadata),
      downloadVault: vi.fn().mockResolvedValue(encryptedBlob),
    });

    const localItems = [makeItem('local-1', '2026-06-01T10:05:00.000Z', { title: 'Local Newer Clock' })];
    const result = await performSync(provider, localItems, MASTER_PW, { lastVerifiedGeneration: 1 });

    expect(result.status).toBe('success');
    expect(provider.downloadVault).toHaveBeenCalledOnce();
    expect(result.mergedItems.map((i) => i.id).sort()).toEqual(['local-1', 'peer-1']);
  });

  it('portably syncs software passkey private keys and folders/tags across devices with different vault keys', async () => {
    const { wrapPrivateKeyJwk, unwrapPrivateKeyJwk } = await import('../passkey');
    const deviceAKey = new Uint8Array(32).fill(0x21);
    const deviceBKey = new Uint8Array(32).fill(0x88);
    const sampleJwk: JsonWebKey = {
      kty: 'EC',
      crv: 'P-256',
      x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU',
      y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0',
      d: 'jpsQnnGQmL-YBIffH1BSyvgTIYlWaLjoOBdeEJvGG6Q',
    };
    const bundleA = await wrapPrivateKeyJwk(sampleJwk, deviceAKey);

    let uploadedBlob = '';
    let uploadedMetadata: any = null;
    const providerA = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'absent' } as SyncRemoteMetadata),
      uploadVault: vi.fn(async (blob, meta) => {
        uploadedBlob = blob;
        uploadedMetadata = meta;
      }),
    });

    const passkeyItem = makeItem('pk-sync-1', '2026-06-01T12:00:00Z', {
      category: 'passkey',
      passkeyProviderKind: 'software',
      passkeyPrivateKeyBundle: bundleA,
    });
    const folder = { id: 'f-sync', name: 'Synced Folder', parentId: null, color: 'blue', icon: 'folder', createdAt: '2026-06-01T00:00:00Z' };
    const tag = { id: 't-sync', name: 'Synced Tag', slug: 'synced-tag', color: 'emerald', createdAt: '2026-06-01T00:00:00Z' };

    const resA = await performSync(providerA, [passkeyItem], MASTER_PW, {
      lastVerifiedGeneration: 0,
      vaultEncryptionKey: deviceAKey,
      localFolders: [folder],
      localTags: [tag],
    });
    expect(resA.status).toBe('success');

    // Device B downloads with its own completely different vault encryption key
    const providerB = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({ kind: 'ok', metadata: uploadedMetadata } as SyncRemoteMetadata),
      downloadVault: vi.fn().mockResolvedValue(uploadedBlob),
    });
    const resB = await performSync(providerB, [], MASTER_PW, {
      lastVerifiedGeneration: 0,
      vaultEncryptionKey: deviceBKey,
    });

    expect(resB.status).toBe('success');
    const syncedPk = resB.mergedItems.find((i) => i.id === 'pk-sync-1')!;
    expect((syncedPk as unknown as Record<string, unknown>).passkeyPrivateKeyJwk).toBeUndefined();
    await expect(unwrapPrivateKeyJwk(syncedPk.passkeyPrivateKeyBundle!, deviceBKey)).resolves.toEqual(sampleJwk);
    await expect(unwrapPrivateKeyJwk(syncedPk.passkeyPrivateKeyBundle!, deviceAKey)).rejects.toThrow();
    expect(resB.mergedFolders).toContainEqual(folder);
    expect(resB.mergedTags).toContainEqual(tag);
  });

  it('rejects remote sync envelopes containing malformed items without ids', async () => {
    const { encryptDataWithPasswordSecure } = await import('../encryption');
    const malformedBlob = await encryptDataWithPasswordSecure(
      JSON.stringify({ schema: 'kalderashield-sync-v2', syncGeneration: 1, deviceId: 'dev', items: [{ title: 'No ID' }] }),
      MASTER_PW,
    );
    await expect(parseSyncEnvelope(malformedBlob, MASTER_PW)).rejects.toMatchObject({
      code: syncErrorCodes.invalidEnvelope,
    });
  });
});
