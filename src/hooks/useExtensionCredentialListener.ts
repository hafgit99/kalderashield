import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { VaultItem } from '../types';

type RawCredentialPayload = Partial<Pick<VaultItem, 'id' | 'title' | 'username' | 'password' | 'url'>>;

/** Normalised (non-empty string) credential payload from the extension. */
export interface ExtensionCredentialPayload {
  title: string;
  username: string;
  password: string;
  url: string;
}

/** Normalised credential password-update payload from the extension. */
export interface ExtensionCredentialUpdatePayload extends ExtensionCredentialPayload {
  id: string;
}

/**
 * Bridges the browser extension's "save credential" and "update password" flows
 * into the desktop vault.
 */
export function useExtensionCredentialListener(
  onAddCredential: (payload: ExtensionCredentialPayload) => void,
  onUpdateCredential?: (payload: ExtensionCredentialUpdatePayload) => void,
) {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) {
      return;
    }

    let cancelled = false;
    let unlistenAdd: (() => void) | null = null;
    let unlistenUpdate: (() => void) | null = null;

    listen<RawCredentialPayload>('add-credential-from-extension', (event) => {
      const payload = event.payload;
      if (payload) {
        onAddCredential({
          title: payload.title || '',
          username: payload.username || '',
          password: payload.password || '',
          url: payload.url || '',
        });
      }
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        unlistenAdd = unlisten;
      }
    }).catch(err => {
      console.error('Failed to listen to tauri add-credential event:', err);
    });

    if (onUpdateCredential) {
      listen<RawCredentialPayload>('update-credential-from-extension', (event) => {
        const payload = event.payload;
        if (payload && typeof payload.id === 'string' && payload.id.trim() && typeof payload.password === 'string' && payload.password.length > 0) {
          onUpdateCredential({
            id: payload.id.trim(),
            title: payload.title || '',
            username: payload.username || '',
            password: payload.password,
            url: payload.url || '',
          });
        }
      }).then((unlisten) => {
        if (cancelled) {
          unlisten();
        } else {
          unlistenUpdate = unlisten;
        }
      }).catch(err => {
        console.error('Failed to listen to tauri update-credential event:', err);
      });
    }

    return () => {
      cancelled = true;
      if (unlistenAdd) {
        unlistenAdd();
      }
      if (unlistenUpdate) {
        unlistenUpdate();
      }
    };
  }, [onAddCredential, onUpdateCredential]);
}
