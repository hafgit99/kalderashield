/**
 * @file sha256.ts
 * @description The one SHA-256 helper in this repo.
 *
 * P2-4 measured five copies of `sha256Hex` -- in `encryption`, `snapshots`,
 * `assetIntegrity`, `syncEngine` and `s3Provider` -- differing only in what they
 * accepted: a `Uint8Array`, a `BufferSource`, or a `string` that each of them
 * encoded first. The hex tail was byte-identical.
 *
 * The single signature takes `BufferSource`, because that is what
 * `crypto.subtle.digest` actually accepts. Callers holding a `string` encode it
 * here rather than at their own call site, so "what bytes are being hashed" stays
 * a question with one answer in the repo: UTF-8, via `TextEncoder`.
 *
 * `s3Provider` used to hash `string | Uint8Array` through an inline `typeof`
 * branch. That branch is gone, but its behaviour is not: both of its call sites
 * passed one or the other, never a string that needed different handling.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { bytesToHex } from './bytes';

export async function sha256Hex(data: BufferSource): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
}

/** UTF-8 encoded SHA-256, the form used for filenames, cache keys and manifests. */
export async function sha256HexOfString(value: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(value));
}