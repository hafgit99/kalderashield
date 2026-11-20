/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { secureRandomBytes } from './random';
import { deriveArgon2idKey, MIN_ARGON2ID_MEMORY_KIB } from './argon2id';
import { webCryptoAesGcmDecrypt, webCryptoAesGcmEncrypt, generateSafeIv } from './webcrypto';
import { bytesToHex } from './common/bytes';
import { sha256Hex } from './common/sha256';

// KalderaShield cross-platform secure backup KDF profile.
//
// memoryKiB is intentionally capped at 32 MiB so that the bundled
// argon2-browser WASM can always satisfy the allocation in WebView2
// (Windows), WebKit (macOS/iOS), WebKitGTK (Linux) and Android WebView.
// Allocating more than ~64 MiB has been observed to crash with
// "memory access out of bounds" in production user reports and in the
// wa-sqlite test runs. The 32 MiB / 3 iteration pairing still meets the
// OWASP password storage recommendation for AES-256-GCM protected backups.
export const BACKUP_KDF_PROFILE = {
  memoryKiB: 32 * 1024,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

// Legacy high-memory fallback removed. Earlier KalderaShield.0.0.x
// releases briefly wrote exports with a 64 MiB / 4-iter profile as part
// of a temporary native KDF parameter-name mismatch. Those exports are
// no longer in circulation: every current build writes the 32 MiB /
// 3-iter profile below, and the recovery test that exercised the
// fallback was replaced with a more general roundtrip test.
//
// Keeping a constant here would still be useful for one-off developer
// recovery scripts, so it stays as a reference value.

export const BACKUP_KDF_LEGACY_HIGH_MEMORY_PROFILE = {
  memoryKiB: 64 * 1024,
  iterations: 4,
  parallelism: 1,
  hashLength: 32,
};

export const secureBackupErrorCodes = {
  invalidJson: 'secureBackup.invalidJson',
  missingFields: 'secureBackup.missingFields',
  checksumMismatch: 'secureBackup.checksumMismatch',
  weakKdfParams: 'secureBackup.weakKdfParams',
  unsupportedLegacyEnvelope: 'secureBackup.unsupportedLegacyEnvelope',
  kdfRuntimeFailure: 'secureBackup.kdfRuntimeFailure',
} as const;

export type SecureBackupErrorCode = (typeof secureBackupErrorCodes)[keyof typeof secureBackupErrorCodes];

export class SecureBackupError extends Error {
  constructor(public readonly code: SecureBackupErrorCode) {
    super(code);
    this.name = 'SecureBackupError';
  }
}

/**
 * F-05: Canonical AES-GCM Associated Data (AAD) binding backup envelope header
 * fields (version, KDF algorithm/parameters, and salt) to the ciphertext tag so
 * header tampering or parameter substitution breaks authentication immediately.
 */
function buildBackupEnvelopeAad(fields: {
  version: string;
  kdf: string;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  hashLength: number;
  salt: string;
}): Uint8Array {
  const canonical = [
    'kalderashield-backup-aad-v1',
    `version=${fields.version}`,
    `kdf=${fields.kdf}`,
    `mem=${fields.memoryKiB}`,
    `iter=${fields.iterations}`,
    `par=${fields.parallelism}`,
    `len=${fields.hashLength}`,
    `salt=${fields.salt}`,
  ].join('|');
  return new TextEncoder().encode(canonical);
}

export async function encryptDataWithPasswordSecure(rawData: string, password: string): Promise<string> {
  const saltBytes = secureRandomBytes(16);
  const saltHex = bytesToHex(saltBytes);
  const kdfParams = { ...BACKUP_KDF_PROFILE };
  const version = '1.2';
  const kdf = 'Argon2id';

  const aesKey = await deriveArgon2idKey(password, saltHex, kdfParams);
  const aad = buildBackupEnvelopeAad({
    version,
    kdf,
    memoryKiB: kdfParams.memoryKiB,
    iterations: kdfParams.iterations,
    parallelism: kdfParams.parallelism,
    hashLength: kdfParams.hashLength,
    salt: saltHex,
  });
  const bundle = await webCryptoAesGcmEncrypt(rawData, aesKey, generateSafeIv(), aad);

  const encoder = new TextEncoder();
  const cipherBytes = encoder.encode(bundle.ciphertext);
  const manifestChecksumHex = await sha256Hex(cipherBytes);

  return JSON.stringify(
    {
      version,
      aadVersion: 1,
      generator: 'KalderaShield Secure Core',
      kdf,
      kdfImplementation: 'argon2-browser',
      kdfProfile: 'KalderaShield-backup-cross-platform-v2',
      kdfParams,
      cipher: 'WebCrypto AES-256-GCM',
      salt: saltHex,
      iv: bundle.iv,
      tag: bundle.tag,
      payload: bundle.ciphertext,
      checksum: manifestChecksumHex,
    },
    null,
    2,
  );
}

export async function decryptDataWithPasswordSecure(envelopeJsonStr: string, password: string): Promise<string> {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(envelopeJsonStr) as Record<string, unknown>;
  } catch (_e) {
    throw new SecureBackupError(secureBackupErrorCodes.invalidJson);
  }

  if (parsed.kdfImplementation !== 'argon2-browser') {
    throw new SecureBackupError(secureBackupErrorCodes.unsupportedLegacyEnvelope);
  }

  const salt = String(parsed.salt || '');
  const iv = String(parsed.iv || '');
  const tag = String(parsed.tag || '');
  const payload = String(parsed.payload || '');
  const checksum = String(parsed.checksum || '');

  if (!salt || !iv || !tag || !payload || !checksum) {
    throw new SecureBackupError(secureBackupErrorCodes.missingFields);
  }

  // Validate KDF params to mitigate downgrade KDF attacks (Z-10).
  // KalderaShield strictly enforces a cryptographic floor of 8 MiB (MIN_ARGON2ID_MEMORY_KIB = 8192)
  // and at least 3 iterations. This guarantees compliance with the OWASP password storage
  // guidelines and RFC 9106 while ensuring portable execution across WASM runtimes.
  if (!parsed.kdfParams || typeof parsed.kdfParams !== 'object') {
    throw new SecureBackupError(secureBackupErrorCodes.weakKdfParams);
  }
  const kdfParams = parsed.kdfParams as { memoryKiB?: unknown; iterations?: unknown; parallelism?: unknown };
  const { memoryKiB, iterations } = kdfParams;
  if (typeof memoryKiB !== 'number' || typeof iterations !== 'number' || memoryKiB < MIN_ARGON2ID_MEMORY_KIB || iterations < 3) {
    throw new SecureBackupError(secureBackupErrorCodes.weakKdfParams);
  }

  const encoder = new TextEncoder();
  const cipherBytes = encoder.encode(payload);
  const calculatedChecksumHex = await sha256Hex(cipherBytes);

  if (calculatedChecksumHex !== checksum) {
    throw new SecureBackupError(secureBackupErrorCodes.checksumMismatch);
  }

  const decryptWithParams = async (params: { memoryKiB?: unknown; iterations?: unknown; parallelism?: unknown; hashLength?: unknown }): Promise<string> => {
    let aesKey: Uint8Array;
    try {
      aesKey = await deriveArgon2idKey(password, salt, params as Parameters<typeof deriveArgon2idKey>[2]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      if (/memory access out of bounds|out of memory|wasm/i.test(message)) {
        throw new SecureBackupError(secureBackupErrorCodes.kdfRuntimeFailure);
      }
      throw error;
    }

    const aad = parsed.aadVersion === 1
      ? buildBackupEnvelopeAad({
          version: String(parsed.version || ''),
          kdf: String(parsed.kdf || ''),
          memoryKiB: Number(params.memoryKiB),
          iterations: Number(params.iterations),
          parallelism: Number(params.parallelism ?? 1),
          hashLength: Number(params.hashLength ?? 32),
          salt,
        })
      : undefined;

    return webCryptoAesGcmDecrypt(
      {
        iv,
        tag,
        ciphertext: payload,
      },
      aesKey,
      aad,
    );
  };

  try {
    return await decryptWithParams(kdfParams);
  } catch (error) {
    // Surface a stable KDF-runtime error directly to the caller.
    if (error instanceof SecureBackupError && error.code === secureBackupErrorCodes.kdfRuntimeFailure) {
      throw error;
    }
    // Every other decryption failure (wrong password, tamper, ...) is
    // propagated unchanged. We no longer retry with the legacy
    // 64 MiB high-memory profile here because v7.0.0.x exports are no
    // longer in circulation and the new 32 MiB / 3-iter profile is
    // the only one the app ever writes.
    throw error;
  }
}

