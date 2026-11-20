/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * F-05: Canonical AES-GCM Associated Data (AAD) binding an encrypted vault row
 * ciphertext to its row id so ciphertext swapped across item rows fails
 * authentication immediately.
 */
export function buildVaultRowAad(itemId: string): Uint8Array {
  return new TextEncoder().encode(`kalderashield-row-aad-v1|id=${itemId}`);
}
