/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { S3SyncConfig, SyncConfig, WebDavSyncConfig } from './syncTypes';
import { SyncError, syncErrorCodes } from './syncTypes';
import type { WebCryptoAesGcmPayload } from '../webcrypto';
import { webCryptoAesGcmEncrypt, webCryptoAesGcmDecrypt, generateSafeIv } from '../webcrypto';
import { deriveArgon2idKey, enforceMinimumKdfFloor, getDefaultKdfProfile } from '../argon2id';
import type { Argon2idOptions } from '../argon2id';
import { secureRandomBytes } from '../random';
import { isPrivateOrLoopbackHostname } from '../airgapNetworkPolicy';

const CONFIG_STORAGE_KEY = 'KalderaShield_sync_config_v1';

/**
 * SEC-B2: sync configuration envelopes carry live WebDAV/S3 credentials, so
 * they are NOT "low-security metadata". Version 1 used a fixed, deterministic
 * salt and a weakened KDF profile, which made offline brute-force against a
 * stolen envelope cheaper and enabled cross-install precomputation. Version 2
 * stores a per-save random salt plus the exact KDF parameters used, matching
 * the full vault KDF profile.
 */
const LEGACY_V1_SALT_HEX = toHex(new TextEncoder().encode('KalderaShield-sync-config-v1'));

const LEGACY_V1_KDF: Argon2idOptions = {
  memoryKiB: 16 * 1024,
  iterations: 2, // historic value; the KDF floor raises this to 3 on derive
  parallelism: 1,
  hashLength: 32,
};

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface SyncConfigKdfParams {
  salt: string;
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  hashLength: number;
}

interface StoredSyncConfigEnvelopeV1 {
  version: 1;
  payload: WebCryptoAesGcmPayload;
}

interface StoredSyncConfigEnvelopeV2 {
  version: 2;
  aadVersion?: 1;
  payload: WebCryptoAesGcmPayload;
  kdf: SyncConfigKdfParams;
}

type StoredSyncConfigEnvelope = StoredSyncConfigEnvelopeV1 | StoredSyncConfigEnvelopeV2;

function buildSyncConfigAad(kdf: SyncConfigKdfParams): Uint8Array {
  const canonical = [
    'kalderashield-sync-config-aad-v1',
    'version=2',
    `salt=${kdf.salt}`,
    `mem=${kdf.memoryKiB}`,
    `iter=${kdf.iterations}`,
    `par=${kdf.parallelism}`,
    `len=${kdf.hashLength}`,
  ].join('|');
  return new TextEncoder().encode(canonical);
}

async function deriveConfigKey(masterPassword: string, kdf: SyncConfigKdfParams): Promise<Uint8Array> {
  return deriveArgon2idKey(masterPassword, kdf.salt, {
    memoryKiB: kdf.memoryKiB,
    iterations: kdf.iterations,
    parallelism: kdf.parallelism,
    hashLength: kdf.hashLength,
  });
}

function createKdfParams(): SyncConfigKdfParams {
  const profile = getDefaultKdfProfile();
  return {
    salt: toHex(secureRandomBytes(16)),
    memoryKiB: profile.memoryKiB,
    iterations: profile.iterations,
    parallelism: profile.parallelism,
    hashLength: profile.hashLength,
  };
}

/**
 * Validates stored KDF parameters before deriving. Rejects malformed input and
 * clamps values to sane bounds so a tampered envelope cannot weaken the KDF
 * below the cryptographic floor (lowered parameters simply fail to decrypt).
 */
function sanitizeKdfParams(raw: unknown): SyncConfigKdfParams | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;

  if (typeof candidate.salt !== 'string' || !/^[0-9a-f]+$/i.test(candidate.salt) || candidate.salt.length < 16) {
    return null;
  }

  const numeric = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

  const memoryKiB = numeric(candidate.memoryKiB);
  const iterations = numeric(candidate.iterations);
  const parallelism = numeric(candidate.parallelism);
  const hashLength = numeric(candidate.hashLength);
  if (memoryKiB === null || iterations === null || parallelism === null || hashLength === null) return null;
  if (hashLength < 32) return null; // AES-256 requires a 32-byte key

  const clamped = enforceMinimumKdfFloor({
    memoryKiB: Math.min(memoryKiB, 1024 * 1024),
    iterations: Math.min(iterations, 16),
    parallelism: Math.min(parallelism, 4),
    hashLength: Math.min(hashLength, 64),
  });

  return { salt: candidate.salt, ...clamped };
}

/**
 * Encrypt and persist the sync configuration.
 * Credentials (WebDAV password, OAuth tokens) never touch localStorage in plaintext.
 * Always writes the version 2 envelope (random salt + full vault KDF profile).
 */
export async function saveSyncConfig(config: SyncConfig, masterPassword: string): Promise<void> {
  if (config.type === 'disabled') {
    localStorage.removeItem(CONFIG_STORAGE_KEY);
    return;
  }

  const kdf = createKdfParams();
  const key = await deriveConfigKey(masterPassword, kdf);
  let payload: WebCryptoAesGcmPayload;
  try {
    payload = await webCryptoAesGcmEncrypt(
      JSON.stringify(config),
      key,
      generateSafeIv(),
      buildSyncConfigAad(kdf),
    );
  } finally {
    key.fill(0);
  }

  const envelope: StoredSyncConfigEnvelopeV2 = { version: 2, aadVersion: 1, payload, kdf };
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(envelope));
}

/**
 * Load and decrypt the sync configuration.
 * Returns `{ type: 'disabled' }` when no configuration is stored.
 * Version 1 envelopes (fixed salt, weakened KDF) remain readable and are
 * transparently upgraded to version 2 on successful decryption.
 */
export async function loadSyncConfig(masterPassword: string): Promise<SyncConfig> {
  const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
  if (!raw) return { type: 'disabled' };

  let envelope: StoredSyncConfigEnvelope;
  try {
    envelope = JSON.parse(raw) as StoredSyncConfigEnvelope;
  } catch {
    return { type: 'disabled' };
  }

  if (envelope.version === 2) {
    const v2 = envelope as StoredSyncConfigEnvelopeV2;
    const kdf = sanitizeKdfParams(v2.kdf);
    if (!kdf || !v2.payload) return { type: 'disabled' };

    let key: Uint8Array | null = null;
    try {
      key = await deriveConfigKey(masterPassword, kdf);
      const aad = v2.aadVersion === 1 ? buildSyncConfigAad(kdf) : undefined;
      const decrypted = await webCryptoAesGcmDecrypt(v2.payload, key, aad);
      return JSON.parse(decrypted) as SyncConfig;
    } catch {
      // Wrong password, tampered KDF parameters, or corrupt data
      throw new SyncError(
        syncErrorCodes.authFailed,
        'Failed to decrypt sync configuration — wrong master password or corrupt data.',
      );
    } finally {
      key?.fill(0);
    }
  }

  if (envelope.version === 1 && envelope.payload) {
    let decrypted: string;
    let legacyKey: Uint8Array | null = null;
    try {
      legacyKey = await deriveConfigKey(masterPassword, {
        salt: LEGACY_V1_SALT_HEX,
        memoryKiB: LEGACY_V1_KDF.memoryKiB ?? 16 * 1024,
        iterations: LEGACY_V1_KDF.iterations ?? 2,
        parallelism: LEGACY_V1_KDF.parallelism ?? 1,
        hashLength: LEGACY_V1_KDF.hashLength ?? 32,
      });
      decrypted = await webCryptoAesGcmDecrypt(envelope.payload, legacyKey);
    } catch {
      throw new SyncError(
        syncErrorCodes.authFailed,
        'Failed to decrypt sync configuration — wrong master password or corrupt data.',
      );
    } finally {
      legacyKey?.fill(0);
    }

    // Transparent upgrade: re-encrypt with a random salt, AAD, and the full KDF profile.
    let upgradedKey: Uint8Array | null = null;
    try {
      const kdf = createKdfParams();
      upgradedKey = await deriveConfigKey(masterPassword, kdf);
      const payload = await webCryptoAesGcmEncrypt(
        decrypted,
        upgradedKey,
        generateSafeIv(),
        buildSyncConfigAad(kdf),
      );
      const upgraded: StoredSyncConfigEnvelopeV2 = { version: 2, aadVersion: 1, payload, kdf };
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(upgraded));
    } catch {
      // Upgrade is best-effort; the legacy envelope stays readable.
    } finally {
      upgradedKey?.fill(0);
    }

    return JSON.parse(decrypted) as SyncConfig;
  }

  return { type: 'disabled' };
}

/**
 * Re-encrypts stored cloud sync configuration under a new master password
 * during master-password rotation so WebDAV/S3 credentials remain accessible.
 *
 * Returns `true` if a saved sync config was rotated, `false` if none was stored.
 */
export async function rotateSyncConfigPassword(
  oldMasterPassword: string,
  newMasterPassword: string,
): Promise<boolean> {
  if (!hasSyncConfig()) return false;
  const config = await loadSyncConfig(oldMasterPassword);
  if (config.type === 'disabled') return false;
  await saveSyncConfig(config, newMasterPassword);
  return true;
}

/** Remove all sync configuration and persisted generation/checksum state from local storage. */
export function clearSyncConfig(): void {
  localStorage.removeItem(CONFIG_STORAGE_KEY);
  localStorage.removeItem('KalderaShield_sync_last_at');
  localStorage.removeItem('KalderaShield_sync_generation');
  localStorage.removeItem('KalderaShield_sync_last_checksum');
}

/** Persist the timestamp of the last successful sync run. */
export function saveLastSyncTime(isoString: string): void {
  localStorage.setItem('KalderaShield_sync_last_at', isoString);
}

/** Returns the ISO-8601 timestamp of the last successful sync, or null. */
export function getLastSyncTime(): string | null {
  return localStorage.getItem('KalderaShield_sync_last_at');
}

/** Returns true if a sync configuration (non-disabled) is currently stored. */
export function hasSyncConfig(): boolean {
  return localStorage.getItem(CONFIG_STORAGE_KEY) !== null;
}

type SyncValidationKey =
  | 'settings.sync.validation.urlRequired'
  | 'settings.sync.validation.httpsRequired'
  | 'settings.sync.validation.invalidUrl'
  | 'settings.sync.validation.usernameRequired'
  | 'settings.sync.validation.passwordRequired'
  | 'settings.sync.validation.endpointRequired'
  | 'settings.sync.validation.invalidEndpoint'
  | 'settings.sync.validation.bucketRequired'
  | 'settings.sync.validation.accessKeyRequired'
  | 'settings.sync.validation.secretKeyRequired';

type SyncTranslate = (key: SyncValidationKey) => string;

/** Validates a WebDAV config object for completeness before saving. */
export function validateWebDavConfig(cfg: Partial<WebDavSyncConfig>, t?: SyncTranslate): string | null {
  if (!cfg.url || !cfg.url.trim()) return t ? t('settings.sync.validation.urlRequired') : 'URL gereklidir.';
  try {
    const parsed = new URL(cfg.url);
    const isLocal = isPrivateOrLoopbackHostname(parsed.hostname);
    if (parsed.protocol !== 'https:' && !isLocal) {
      return t
        ? t('settings.sync.validation.httpsRequired')
        : 'Güvenlik için HTTPS gereklidir (yerel ağ adresleri muaf tutulur).';
    }
  } catch {
    return t ? t('settings.sync.validation.invalidUrl') : 'Geçersiz URL formatı.';
  }
  if (!cfg.username || !cfg.username.trim()) return t ? t('settings.sync.validation.usernameRequired') : 'Kullanıcı adı gereklidir.';
  if (!cfg.password || !cfg.password.trim()) return t ? t('settings.sync.validation.passwordRequired') : 'Şifre veya uygulama token gereklidir.';
  return null;
}

/** Validates an S3 config object for completeness before saving. */
export function validateS3Config(cfg: Partial<S3SyncConfig>, t?: SyncTranslate): string | null {
  if (!cfg.endpoint || !cfg.endpoint.trim()) return t ? t('settings.sync.validation.endpointRequired') : 'S3 Endpoint URL gereklidir.';
  try {
    const parsed = new URL(cfg.endpoint);
    const isLocal = isPrivateOrLoopbackHostname(parsed.hostname);
    if (parsed.protocol !== 'https:' && !isLocal) {
      return t
        ? t('settings.sync.validation.httpsRequired')
        : 'Güvenlik için HTTPS gereklidir (yerel ağ adresleri muaf tutulur).';
    }
  } catch {
    return t ? t('settings.sync.validation.invalidEndpoint') : 'Geçersiz Endpoint URL formatı.';
  }
  if (!cfg.bucket || !cfg.bucket.trim()) return t ? t('settings.sync.validation.bucketRequired') : 'Bucket adı gereklidir.';
  if (!cfg.accessKeyId || !cfg.accessKeyId.trim()) return t ? t('settings.sync.validation.accessKeyRequired') : 'Access Key ID gereklidir.';
  if (!cfg.secretAccessKey || !cfg.secretAccessKey.trim()) return t ? t('settings.sync.validation.secretKeyRequired') : 'Secret Access Key gereklidir.';
  return null;
}
