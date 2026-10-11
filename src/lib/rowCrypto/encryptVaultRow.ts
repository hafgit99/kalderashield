/**
 * @file rowCrypto.ts
 * @description Encrypting and decrypting individual vault rows.
 *
 * Every write to `vault_items` produces the same six lines: derive a per-item
 * key from the vault key, AES-GCM encrypt the serialized item, zero the derived
 * key, build the row, cache the plaintext against the row's `enc_metadata`.
 * That sequence appeared four times in `sqlite_opfs.ts` with the important
 * detail that the derived key is zeroized *after* the encrypt returns and never
 * before -- and a copy-paste of the block in the wrong order would silently
 * encrypt with a zeroed key, which throws rather than writing garbage, so the
 * failure is loud but the cause is not obvious from the call site.
 *
 * Decryption already lives in `sqliteOpfsRowDecryptor`. This module is the
 * write half, and it is where a row is turned into ciphertext.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../../types';
import type { VaultDatabaseRow } from '../vaultDatabaseFormat';
import { buildVaultItemRow } from '../sqliteOpfsShared';
import { webCryptoAesGcmEncrypt, generateSafeIv, derivePerItemKey } from '../webcrypto';

export interface EncryptRowOptions {
  /** Vault key; the per-item key is derived from this. */
  derivedKey: Uint8Array;
  /** Row id, already assigned. The per-item key is bound to it. */
  itemId: string;
  /** The item to encrypt. */
  item: VaultItem;
  /** Existing row, when replacing, so `created_at` survives. */
  existing?: VaultDatabaseRow;
  /** Timestamp for `updated_at`; injected so callers control it. */
  now: string;
}

/**
 * Encrypts one item under a key derived from the vault key and the row id.
 *
 * Returns the row and its cache entry together. Handing back both is the point:
 * the cache is keyed by id and holds `enc_metadata` from the row that was
 * *just written*, and a caller that updates the row but forgets the cache
 * leaves the next read decrypting a ciphertext that no longer exists.
 */
export async function encryptVaultRow(
  options: EncryptRowOptions,
): Promise<{ row: VaultDatabaseRow; cacheEntry: { enc_metadata: string; item: VaultItem } }> {
  const { derivedKey, itemId, item, existing, now } = options;

  const toEncrypt = { ...item, id: itemId };
  const perItemKey = await derivePerItemKey(derivedKey, itemId);
  try {
    const encrypted = await webCryptoAesGcmEncrypt(
      JSON.stringify(toEncrypt),
      perItemKey,
      generateSafeIv(),
    );

    const row = buildVaultItemRow({
      id: itemId,
      encrypted,
      item,
      createdAt: item.createdAt || existing?.created_at || now,
      updatedAt: now,
    });

    return {
      row,
      cacheEntry: { enc_metadata: row.enc_metadata, item: toEncrypt },
    };
  } finally {
    // Zeroize in `finally`, not after the encrypt: an encrypt that rejects
    // would otherwise leave the derived key live on the heap. The encrypt has
    // already consumed it by this point either way.
    perItemKey.fill(0);
  }
}