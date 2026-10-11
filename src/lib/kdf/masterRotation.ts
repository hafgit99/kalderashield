/**
 * @file masterRotation.ts
 * @description The re-encryption half of a master-credential rotation.
 *
 * Both `changeMasterPassword` (browser/legacy path) and
 * `changeMasterPasswordWithHash` (desktop path, which gets its argon hash and
 * key material from Rust) were doing the same ten steps with two differences:
 * where the hash came from, and whether passkeys needed re-wrapping. That
 * duplication is not cosmetic -- it is where this session's rotation bugs
 * lived:
 *
 *   - `changeMasterPassword` derived the OLD key *after* replacing
 *     `state.encryption_salt`, so it derived it from the NEW salt. Passkey
 *     re-wrapping decrypted nothing and the re-seal gate then failed.
 *   - The two methods disagreed on error handling: one re-threw
 *     `master-password-rotation-persist-failed` verbatim, the other collapsed
 *     every failure into `master-password-rotation-failed`.
 *
 * One body, both entry points, and the salt ordering is a parameter rather than
 * something a caller can get wrong by reading the wrong line.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../../types';
import type { VersionedVaultDatabaseState } from '../vaultDatabaseFormat';
import { secureRandomToken } from '../random';
import { buildVaultItemRow } from '../sqliteOpfsShared';
import { webCryptoAesGcmEncrypt, generateSafeIv } from '../webcrypto';

export interface MasterRotationDeps {
  /** The items to re-encrypt, already decrypted under the old key. */
  items: VaultItem[];
  /** The key the stored rows were encrypted under. Never the new one. */
  oldVaultKey: Uint8Array;
  /** The key the rows are re-encrypted under. */
  newVaultKey: Uint8Array;
}

export interface MasterRotationResult {
  /** The re-encrypted rows, ready to be assigned back onto the state. */
  rows: VersionedVaultDatabaseState['vault_items'];
  /** id → { enc_metadata, item } for repopulating the decrypted cache. */
  cacheEntries: Map<string, { enc_metadata: string; item: VaultItem }>;
  /** Rows affected, for the query log. */
  affected: number;
}

/**
 * Re-encrypts every item under `newVaultKey`.
 *
 * Returns the new rows rather than mutating state: the caller owns the
 * transactional scope, and a rotation that mutates first and rolls back second
 * is how the state and the cache can disagree after a failure.
 */
export async function rotateMasterEncryptedRows(deps: MasterRotationDeps): Promise<MasterRotationResult> {
  const { items, newVaultKey } = deps;

  const rows = await Promise.all(items.map(async (item) => {
    const encrypted = await webCryptoAesGcmEncrypt(JSON.stringify(item), newVaultKey, generateSafeIv());
    const nowStr = new Date().toISOString();

    return buildVaultItemRow({
      id: item.id || secureRandomToken(9),
      encrypted,
      item,
      createdAt: item.createdAt || nowStr,
      updatedAt: nowStr,
    });
  }));

  // The cache is keyed by id and points at the freshly written rows, not at
  // the items that went in: after a rotation the two differ in `enc_metadata`,
  // and a cache still holding the old metadata reads as a decrypt failure on
  // the next access.
  const cacheEntries = new Map<string, { enc_metadata: string; item: VaultItem }>();
  for (const item of items) {
    const row = rows.find((candidate) => candidate.id === item.id);
    if (row) {
      cacheEntries.set(row.id, { enc_metadata: row.enc_metadata, item });
    }
  }

  return { rows, cacheEntries, affected: items.length };
}

/**
 * The two messages a rotation can end in, and the single rule that produced
 * them.
 *
 * A persistence failure (`false` from the write) is reported as itself, because
 * the caller needs to tell "the write did not happen" from "the write happened
 * and something after it failed". Everything else is one opaque failure: the
 * caller cannot act on the distinction and leaking the inner message tells a
 * caller which internal stage failed, which is not information it can use.
 */
export const ROTATION_ERRORS = {
  persistFailed: 'master-password-rotation-persist-failed',
  failed: 'master-password-rotation-failed',
} as const;

export function rotationErrorFor(err: unknown): Error {
  return err instanceof Error && err.message === ROTATION_ERRORS.persistFailed
    ? err
    : new Error(ROTATION_ERRORS.failed);
}