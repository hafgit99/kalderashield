import { WebDavSyncProvider } from './webdavProvider';
import { S3SyncProvider } from './s3Provider';
import type { SyncConfig, SyncProvider } from './syncTypes';

/**
 * The sync barrel.
 *
 * P2-5: this re-exported 24 names and 11 imported 13 of them. A barrel that
 * promises the whole module surface is a barrel nobody can delete from --
 * `buildSyncEnvelope` and `resolveLWWConflicts` were reachable from here, so
 * the only way to ask "who calls conflict resolution?" was to grep every file.
 * They are still exported from `syncEngine.ts`, where they are defined and
 * where their tests import them; what is gone is the second, wider door.
 */
export type { SyncProvider, SyncConfig, SyncProviderType } from './syncTypes';

export { WebDavSyncProvider } from './webdavProvider';
export { S3SyncProvider } from './s3Provider';

export { performSync } from './syncEngine';

export {
  saveSyncConfig,
  loadSyncConfig,
  clearSyncConfig,
  hasSyncConfig,
  saveLastSyncTime,
  getLastSyncTime,
  validateWebDavConfig,
  validateS3Config,
} from './syncConfigStorage';

/**
 * Factory: creates the appropriate SyncProvider from a SyncConfig.
 * Returns null when config.type is 'disabled'.
 */
export function createSyncProvider(config: SyncConfig): SyncProvider | null {
  if (config.type === 'disabled') return null;

  if (config.type === 'webdav') {
    return new WebDavSyncProvider(config.url, config.username, config.password);
  }

  if (config.type === 's3') {
    return new S3SyncProvider(config);
  }

  return null;
}

