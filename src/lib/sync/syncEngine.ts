/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../../types';
import { encryptDataWithPasswordSecure, decryptDataWithPasswordSecure } from '../encryption';
import { secureRandomToken } from '../random';
import type {
  SyncProvider,
  SyncResult,
  SyncMetadata,
  SyncRemoteMetadata,
  SyncConflictItem,
} from './syncTypes';
import { SyncError, syncErrorCodes } from './syncTypes';
import { validateRemoteSyncMetadata } from './syncTypes';
import { sha256HexOfString } from '../common/sha256';

const VAULT_VERSION = '7.0';
const SYNC_PAYLOAD_SCHEMA_V2 = 'kalderashield-sync-v2';
const SYNC_GENERATION_STORAGE_KEY = 'KalderaShield_sync_generation';

interface AuthenticatedSyncPayloadV2 {
  schema: typeof SYNC_PAYLOAD_SCHEMA_V2;
  syncGeneration: number;
  deviceId: string;
  items: VaultItem[];
}

interface ParsedSyncEnvelopeMetadata {
  syncGeneration?: number;
  deviceId?: string;
}

export interface PerformSyncOptions {
  /** Override minimum accepted generation floor (defaults to locally persisted generation). */
  lastVerifiedGeneration?: number;
}

function getLastSyncGeneration(): number {
  const store = typeof localStorage !== 'undefined' ? localStorage : null;
  const raw = store?.getItem(SYNC_GENERATION_STORAGE_KEY);
  if (!raw) return 0;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function setLastSyncGeneration(generation: number): void {
  if (!Number.isInteger(generation) || generation < 1) return;
  const store = typeof localStorage !== 'undefined' ? localStorage : null;
  try {
    store?.setItem(SYNC_GENERATION_STORAGE_KEY, String(generation));
  } catch {
    // Ignore storage quota errors
  }
}

/** Returns a stable per-device random UUID, generated once and persisted in localStorage. */
function getOrCreateDeviceId(): string {
  const key = 'KalderaShield_sync_device_id';
  const store = typeof localStorage !== 'undefined' ? localStorage : null;
  const existing = store?.getItem(key);
  if (existing) return existing;
  const id = secureRandomToken(16);
  store?.setItem(key, id);
  return id;
}



// ─── Envelope Build / Parse ──────────────────────────────────────────────────

/**
 * Encrypts vault items into a portable sync envelope using the existing
 * KalderaShield Argon2id + AES-256-GCM backup format (encryptDataWithPasswordSecure).
 *
 * The envelope includes all items (active + tombstones) so that remote peers
 * can replay deletions correctly.
 */
export async function buildSyncEnvelope(
  items: VaultItem[],
  masterPassword: string,
  syncGeneration = 1,
): Promise<{ encryptedBlob: string; metadata: SyncMetadata }> {
  const deviceId = getOrCreateDeviceId();
  const normalizedGen = Number.isInteger(syncGeneration) && syncGeneration >= 1 ? syncGeneration : 1;
  const v2Payload: AuthenticatedSyncPayloadV2 = {
    schema: SYNC_PAYLOAD_SCHEMA_V2,
    syncGeneration: normalizedGen,
    deviceId,
    items,
  };
  const payload = JSON.stringify(v2Payload);
  const encryptedBlob = await encryptDataWithPasswordSecure(payload, masterPassword);
  const checksum = await sha256HexOfString(encryptedBlob);

  const latestItemUpdatedAt = items.reduce((latest, item) => {
    const candidate = new Date(item.updatedAt ?? item.createdAt).getTime();
    return Number.isFinite(candidate) && candidate > latest ? candidate : latest;
  }, 0);

  const metadata: SyncMetadata = {
    updatedAt: new Date(latestItemUpdatedAt || Date.now()).toISOString(),
    deviceId,
    vaultVersion: VAULT_VERSION,
    checksum,
    itemCount: items.length,
    syncGeneration: normalizedGen,
  };

  return { encryptedBlob, metadata };
}

/**
 * Decrypts and parses a sync envelope, verifying the checksum first.
 * Supports both v2 AEAD-authenticated generation payloads and legacy v1 item arrays.
 */
export async function parseSyncEnvelope(
  encryptedBlob: string,
  masterPassword: string,
  expectedChecksum?: string,
  onMetadata?: (meta: ParsedSyncEnvelopeMetadata) => void,
): Promise<VaultItem[]> {
  if (expectedChecksum) {
    const actual = await sha256HexOfString(encryptedBlob);
    if (actual !== expectedChecksum) {
      throw new SyncError(syncErrorCodes.checksumMismatch, 'Remote vault checksum mismatch — possible tampering');
    }
  }

  let decrypted: string;
  try {
    decrypted = await decryptDataWithPasswordSecure(encryptedBlob, masterPassword);
  } catch {
    throw new SyncError(syncErrorCodes.invalidEnvelope, 'Failed to decrypt remote vault — wrong password or corrupt data');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decrypted);
  } catch {
    throw new SyncError(syncErrorCodes.invalidEnvelope, 'Remote vault contains invalid JSON after decryption');
  }

  if (Array.isArray(parsed)) {
    onMetadata?.({});
    return parsed as VaultItem[];
  }

  if (
    parsed
    && typeof parsed === 'object'
    && (parsed as Partial<AuthenticatedSyncPayloadV2>).schema === SYNC_PAYLOAD_SCHEMA_V2
    && Array.isArray((parsed as Partial<AuthenticatedSyncPayloadV2>).items)
  ) {
    const envelope = parsed as AuthenticatedSyncPayloadV2;
    const gen = Number.isInteger(envelope.syncGeneration) && envelope.syncGeneration >= 1
      ? envelope.syncGeneration
      : undefined;
    onMetadata?.({
      syncGeneration: gen,
      deviceId: typeof envelope.deviceId === 'string' ? envelope.deviceId : undefined,
    });
    return envelope.items;
  }

  throw new SyncError(syncErrorCodes.invalidEnvelope, 'Remote vault contains unrecognized payload structure');
}

// ─── LWW Conflict Resolution ─────────────────────────────────────────────────

/**
 * Merges remote items into local items using Last-Write-Wins semantics:
 *
 * - For each remote item, compare `updatedAt` timestamps.
 * - Remote wins if its `updatedAt` is strictly later.
 * - Tombstones (deleted=true) are treated the same as active items.
 * - Items present only remotely are added to local.
 * - Items present only locally are kept as-is.
 *
 * Returns `{ merged, conflicts }` where `conflicts` contains items where
 * the difference in `updatedAt` is under 5 seconds (near-simultaneous writes).
 */
function hasMeaningfulDifference(a: VaultItem, b: VaultItem): boolean {
  return (
    a.title !== b.title
    || a.username !== b.username
    || a.password !== b.password
    || a.url !== b.url
    || a.notes !== b.notes
    || a.totpSecret !== b.totpSecret
  );
}

export function resolveLWWConflicts(
  localItems: VaultItem[],
  remoteItems: VaultItem[],
): { merged: VaultItem[]; conflicts: SyncConflictItem[]; conflictCopies: VaultItem[] } {
  const localMap = new Map<string, VaultItem>(localItems.map((i) => [i.id, i]));
  const conflicts: SyncConflictItem[] = [];
  const conflictCopies: VaultItem[] = [];

  for (const remote of remoteItems) {
    const local = localMap.get(remote.id);
    if (!local) {
      // Remote-only item — add it
      localMap.set(remote.id, remote);
      continue;
    }

    const localTs = new Date(local.updatedAt ?? local.createdAt).getTime();
    const remoteTs = new Date(remote.updatedAt ?? remote.createdAt).getTime();
    const diffMs = Math.abs(remoteTs - localTs);

    if (remoteTs > localTs) {
      // Remote is newer — apply it
      localMap.set(remote.id, remote);
      if (diffMs < 5_000) {
        // Near-simultaneous — flag as conflict for visibility and preserve a
        // non-destructive copy of the overwritten local version when content differs.
        conflicts.push({
          id: remote.id,
          title: remote.title,
          localUpdatedAt: local.updatedAt,
          remoteUpdatedAt: remote.updatedAt,
        });
        if (hasMeaningfulDifference(local, remote)) {
          conflictCopies.push({
            ...local,
            id: `${local.id}-conflict-${secureRandomToken(6)}`,
            title: `${local.title} (Conflict Copy)`,
          });
        }
      }
    }
    // else: local is newer or same timestamp — keep local silently
  }

  return { merged: Array.from(localMap.values()), conflicts, conflictCopies };
}

// ─── Main Sync Orchestration ─────────────────────────────────────────────────

/**
 * Performs a full bidirectional sync against the configured provider:
 *
 * 1. Download remote metadata (lightweight check).
 * 2. If remote is newer, download and decrypt the full vault blob.
 * 3. Apply LWW merge to produce the canonical item list.
 * 4. Encrypt the merged list and upload.
 * 5. Return a SyncResult with merge statistics and any conflicts.
 *
 * @param provider — configured SyncProvider instance
 * @param localItems — current decrypted vault items from local storage
 * @param masterPassword — used for encrypt/decrypt operations
 */
export async function performSync(
  provider: SyncProvider,
  localItems: VaultItem[],
  masterPassword: string,
  options?: PerformSyncOptions,
): Promise<SyncResult & { mergedItems: VaultItem[] }> {
  const minAllowedGeneration = options?.lastVerifiedGeneration ?? getLastSyncGeneration();
  let remoteState: SyncRemoteMetadata;
  try {
    remoteState = await provider.getRemoteMetadata();
  } catch (err) {
    const syncErr = err instanceof SyncError ? err : new SyncError(syncErrorCodes.downloadFailed, String(err));
    return { status: 'error', error: syncErr, mergedItems: localItems };
  }

  let mergedItems = localItems;
  let mergedCount = 0;
  let conflicts: SyncConflictItem[] = [];
  let conflictCopies: VaultItem[] = [];
  let observedRemoteGeneration = 0;

  // Y-11: the remote exists but we cannot read its descriptor. Its vault blob
  // may be intact AND newer than local — a metadata write can fail while the
  // blob write succeeds, which is exactly how this state arises in practice.
  //
  // The old code mapped this to "no remote" and then uploaded unconditionally,
  // destroying the user's only off-device backup and reporting success. Not
  // knowing what is remote is a reason to stop, not a reason to overwrite.
  if (remoteState.kind === 'unreadable') {
    return {
      status: 'error',
      error: new SyncError(
        syncErrorCodes.remoteStateUnknown,
        `Refusing to upload: the remote snapshot exists but its metadata is unreadable (${remoteState.detail}). ` +
        'Nothing was uploaded, so the remote vault is untouched. Check the remote folder, then run sync again.',
      ),
      mergedItems: localItems,
    };
  }

  /** ETag observed on the read, replayed as a write precondition. */
  let observedETag: string | undefined;

  if (remoteState.kind === 'ok') {
    // O-21 (defence in depth): the providers validate the remote metadata, but
    // this is the code that actually compares timestamps and decides whether it
    // is safe to upload. The invariant that matters must hold *here*, not merely
    // in the callers: an unparsable `updatedAt` becomes `NaN`, and `NaN > x` is
    // false, which would make sync skip the download and overwrite the remote.
    const validation = validateRemoteSyncMetadata(remoteState.metadata);
    if (!validation.ok) {
      return {
        status: 'error',
        error: new SyncError(
          syncErrorCodes.remoteMetadataInvalid,
          `Refusing to upload: remote metadata is unusable (${validation.reason}). ` +
            'Nothing was uploaded, so the remote vault is untouched.',
        ),
        mergedItems: localItems,
      };
    }
    const remoteMetadata = validation.metadata;
    observedETag = remoteState.etag;

    // F-06 pre-download rollback check on remote metadata generation.
    if (
      minAllowedGeneration > 0
      && typeof remoteMetadata.syncGeneration === 'number'
      && remoteMetadata.syncGeneration < minAllowedGeneration
    ) {
      return {
        status: 'error',
        error: new SyncError(
          syncErrorCodes.rollbackDetected,
          `Refusing sync: remote generation (${remoteMetadata.syncGeneration}) is older than the last verified generation (${minAllowedGeneration}).`,
        ),
        mergedItems: localItems,
      };
    }

    // Determine whether the remote snapshot is worth downloading.
    // We always download when we have no local data yet, when the remote
    // metadata timestamp is strictly newer than our newest local item, or when
    // the remote carries a newer sync generation.
    const latestLocalTs = localItems.reduce((max, i) => {
      const ts = new Date(i.updatedAt ?? i.createdAt).getTime();
      return ts > max ? ts : max;
    }, 0);
    const remoteTs = new Date(remoteMetadata.updatedAt).getTime();
    const remoteHasNewerGeneration =
      typeof remoteMetadata.syncGeneration === 'number'
      && remoteMetadata.syncGeneration > minAllowedGeneration;

    if (remoteTs > latestLocalTs || localItems.length === 0 || remoteHasNewerGeneration) {
      let remoteBlob: string | null;
      try {
        remoteBlob = await provider.downloadVault();
      } catch (err) {
        const syncErr = err instanceof SyncError ? err : new SyncError(syncErrorCodes.downloadFailed, String(err));
        return { status: 'error', error: syncErr, mergedItems: localItems };
      }

      if (remoteBlob) {
        let remoteItems: VaultItem[];
        let authenticatedMeta: ParsedSyncEnvelopeMetadata = {};
        try {
          remoteItems = await parseSyncEnvelope(
            remoteBlob,
            masterPassword,
            remoteMetadata.checksum,
            (meta) => {
              authenticatedMeta = meta;
            },
          );
        } catch (err) {
          const syncErr = err instanceof SyncError ? err : new SyncError(syncErrorCodes.invalidEnvelope, String(err));
          return { status: 'error', error: syncErr, mergedItems: localItems };
        }

        // F-06: Cryptographically authenticated rollback check. Even if a
        // hostile storage server lied in plaintext `metadata.json`, the
        // generation embedded inside the AES-256-GCM ciphertext cannot be forged.
        if (
          typeof remoteMetadata.syncGeneration === 'number'
          && typeof authenticatedMeta.syncGeneration === 'number'
          && remoteMetadata.syncGeneration !== authenticatedMeta.syncGeneration
        ) {
          return {
            status: 'error',
            error: new SyncError(
              syncErrorCodes.rollbackDetected,
              `Refusing sync: remote metadata generation (${remoteMetadata.syncGeneration}) disagrees with authenticated payload generation (${authenticatedMeta.syncGeneration}).`,
            ),
            mergedItems: localItems,
          };
        }
        if (
          minAllowedGeneration > 0
          && typeof authenticatedMeta.syncGeneration === 'number'
          && authenticatedMeta.syncGeneration < minAllowedGeneration
        ) {
          return {
            status: 'error',
            error: new SyncError(
              syncErrorCodes.rollbackDetected,
              `Refusing sync: authenticated remote generation (${authenticatedMeta.syncGeneration}) is older than the last verified generation (${minAllowedGeneration}).`,
            ),
            mergedItems: localItems,
          };
        }

        observedRemoteGeneration = authenticatedMeta.syncGeneration ?? remoteMetadata.syncGeneration ?? 0;

        const resolved = resolveLWWConflicts(localItems, remoteItems);
        mergedItems = resolved.merged;
        conflicts = resolved.conflicts;
        conflictCopies = resolved.conflictCopies;
        mergedCount = mergedItems.length - localItems.length;
      }
    } else if (typeof remoteMetadata.syncGeneration === 'number') {
      observedRemoteGeneration = remoteMetadata.syncGeneration;
    }
  }

  const nextGeneration = Math.max(minAllowedGeneration, observedRemoteGeneration) + 1;

  // Upload the merged state
  let encryptedBlob: string;
  let metadata: SyncMetadata;
  try {
    ({ encryptedBlob, metadata } = await buildSyncEnvelope(mergedItems, masterPassword, nextGeneration));
  } catch (err) {
    return {
      status: 'error',
      error: new SyncError(syncErrorCodes.uploadFailed, `Encryption failed: ${String(err)}`),
      mergedItems,
    };
  }

  try {
    // Y-11: the write is conditional on the ETag we read, so a concurrent
    // modification from another device is rejected instead of clobbered.
    await provider.uploadVault(encryptedBlob, metadata, { ifMatch: observedETag });
  } catch (err) {
    const syncErr = err instanceof SyncError ? err : new SyncError(syncErrorCodes.uploadFailed, String(err));
    return { status: 'error', error: syncErr, mergedItems };
  }

  setLastSyncGeneration(nextGeneration);

  // Y-11: the ETag of the object we just wrote, so the next sync can tell
  // "still my snapshot" from "another device replaced it". Best effort — a
  // provider that cannot report it leaves this undefined.
  let uploadedETag: string | undefined;
  if (typeof provider.getVaultETag === 'function') {
    try {
      uploadedETag = (await provider.getVaultETag()) ?? undefined;
    } catch {
      uploadedETag = undefined;
    }
  }

  return {
    status: conflicts.length > 0 ? 'conflict' : 'success',
    syncedAt: metadata.updatedAt,
    mergedCount,
    conflicts,
    ...(conflictCopies.length > 0 ? { conflictCopies } : {}),
    syncGeneration: nextGeneration,
    mergedItems,
    uploadedETag,
  };
}
