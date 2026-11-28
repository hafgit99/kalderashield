import { invoke } from '@tauri-apps/api/core';
import type { VaultItem } from '../types';

export const EXTENSION_CREDENTIAL_LEASE_MS = 5 * 60 * 1000;

export { isDesktopRuntime, isAndroidRuntime } from './environment';
import { isDesktopRuntime, isAndroidRuntime } from './environment';

export type NativeVaultStorageScope = 'android-app-private' | 'desktop-app-data' | 'browser-fallback';

export function getNativeVaultStorageScope(): NativeVaultStorageScope {
  if (!isDesktopRuntime()) return 'browser-fallback';
  return isAndroidRuntime() ? 'android-app-private' : 'desktop-app-data';
}

export async function readDesktopVaultDatabase(): Promise<string | null> {
  if (!isDesktopRuntime()) return null;
  return invoke<string | null>('read_vault_database');
}

export async function writeDesktopVaultDatabase(contents: string): Promise<boolean> {
  if (!isDesktopRuntime()) return false;
  await invoke('write_vault_database', { contents });
  return true;
}

export async function resetDesktopVaultDatabase(): Promise<boolean> {
  if (!isDesktopRuntime()) return false;
  await invoke('reset_vault_database');
  return true;
}

export async function syncExtensionCredentials(items: VaultItem[], ttlMs = EXTENSION_CREDENTIAL_LEASE_MS): Promise<void> {
  if (!isDesktopRuntime()) return;
  try {
    const creds = items
      .filter(item => !item.deleted)
      .map(item => ({
        id: item.id,
        title: item.title,
        username: item.username || item.cardholderName || '',
        password: item.password || item.cardNumber || '',
        url: item.url || '',
        additionalUrls: Array.isArray(item.additionalUrls) ? item.additionalUrls.filter(Boolean) : [],
        category: item.category,
        favorite: Boolean(item.favorite),
        totpSecret: item.totpSecret || '',
        hasTotp: Boolean(item.totpSecret && item.totpSecret.trim().length > 0),
        cardExpiry: item.cardExpiry || '',
        cardCvv: item.cardCvv || '',
      }));
    await invoke('sync_extension_credentials', { credentials: creds, ttlMs });
    const softwarePasskeys = items
      .filter(
        (item) =>
          !item.deleted
          && item.category === 'passkey'
          && item.passkeyProviderKind === 'software'
          && Boolean(item.passkeyRpId)
          && Boolean(item.passkeyCredentialId),
      )
      .map((item) => ({
        rpId: item.passkeyRpId!,
        credentialId: item.passkeyCredentialId!,
      }));
    await invoke('sync_extension_passkeys', { passkeys: softwarePasskeys });
  } catch (error) {
    console.error('Failed to sync credentials to extension:', error);
  }
}

export async function resolveExtensionPasskeyRequest(
  requestId: string,
  response: Record<string, unknown>,
): Promise<boolean> {
  if (!isDesktopRuntime()) return false;
  try {
    return await invoke<boolean>('resolve_extension_passkey_request', {
      requestId,
      response,
    });
  } catch (error) {
    console.error('Failed to resolve extension passkey request:', error);
    return false;
  }
}

export async function clearExtensionCredentials(): Promise<void> {
  if (!isDesktopRuntime()) return;
  try {
    await invoke('clear_extension_credentials');
  } catch (error) {
    console.error('Failed to clear extension credentials:', error);
  }
}
