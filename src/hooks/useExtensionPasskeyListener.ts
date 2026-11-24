/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Listens for WebAuthn passkey create/get requests forwarded from the browser
 * extension over the AEAD native-messaging bridge, drives the desktop approval
 * modal, and resolves each pending Rust IPC channel with either a signed
 * WebAuthn credential, an explicit device-authenticator fallback, or cancellation.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { AppNotification, VaultItem } from '../types';
import { recordToVaultFields, type PasskeyRecord } from '../lib/passkey';
import {
  createSoftwarePasskey,
  findMatchingSoftwarePasskeys,
  signSoftwarePasskeyAssertion,
} from '../lib/passkeyProvider';
import { resolveExtensionPasskeyRequest } from '../lib/desktopStorage';
import {
  cancelAndroidPasskeyRequest,
  completeAndroidPasskeyRequest,
  getPendingAndroidPasskeyRequest,
  subscribeAndroidPasskeyRequestCleared,
  subscribeAndroidPasskeyRequests,
} from '../lib/androidPasskey';

export interface ExtensionPasskeyRequest {
  requestId: string;
  kind: 'create' | 'get';
  source?: 'desktop-extension' | 'android-credential-provider';
  origin: string;
  rpId: string;
  rpName?: string;
  userName?: string;
  userDisplayName?: string;
  userIdBase64Url?: string;
  challengeBase64Url: string;
  pubKeyCredAlgs?: number[];
  excludeCredentialIds?: string[];
  allowCredentialIds?: string[];
  crossOrigin?: boolean;
}

interface UseExtensionPasskeyListenerOptions {
  items: VaultItem[];
  onSaveItem: (item: VaultItem) => Promise<void>;
  onNotify?: (notification: AppNotification) => void;
}

export function useExtensionPasskeyListener({
  items,
  onSaveItem,
  onNotify,
}: UseExtensionPasskeyListenerOptions) {
  const [pendingRequest, setPendingRequest] = useState<ExtensionPasskeyRequest | null>(() => {
    const androidPending = getPendingAndroidPasskeyRequest();
    return androidPending ? { ...androidPending, source: 'android-credential-provider' } : null;
  });
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubAndroid = subscribeAndroidPasskeyRequests((request) => {
      setErrorMessage(null);
      setPendingRequest({ ...request, source: 'android-credential-provider' });
    });
    const unsubAndroidCleared = subscribeAndroidPasskeyRequestCleared((clearedId) => {
      setPendingRequest((current) =>
        current && current.requestId === clearedId ? null : current,
      );
    });

    if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) {
      return () => {
        unsubAndroid();
        unsubAndroidCleared();
      };
    }

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    listen<ExtensionPasskeyRequest>('extension-passkey-request', (event) => {
      const payload = event.payload;
      if (!payload || !payload.requestId || !payload.origin || !payload.rpId || !payload.challengeBase64Url) {
        return;
      }
      if (payload.kind !== 'create' && payload.kind !== 'get') {
        return;
      }
      setErrorMessage(null);
      setPendingRequest({ ...payload, source: 'desktop-extension' });
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    }).catch((err) => {
      console.error('Failed to listen to extension-passkey-request:', err);
    });

    return () => {
      cancelled = true;
      unsubAndroid();
      unsubAndroidCleared();
      if (unlisten) unlisten();
    };
  }, []);

  const matchingRecords: PasskeyRecord[] = useMemo(() => {
    if (!pendingRequest || pendingRequest.kind !== 'get') return [];
    return findMatchingSoftwarePasskeys(
      items,
      pendingRequest.rpId,
      pendingRequest.allowCredentialIds,
    );
  }, [items, pendingRequest]);

  const approveCreate = useCallback(async () => {
    if (!pendingRequest || pendingRequest.kind !== 'create') return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const { record, credential } = await createSoftwarePasskey(
        {
          requestId: pendingRequest.requestId,
          origin: pendingRequest.origin,
          rpId: pendingRequest.rpId,
          rpName: pendingRequest.rpName,
          userName: pendingRequest.userName || pendingRequest.userDisplayName || pendingRequest.rpId,
          userDisplayName: pendingRequest.userDisplayName,
          userIdBase64Url: pendingRequest.userIdBase64Url,
          challengeBase64Url: pendingRequest.challengeBase64Url,
          pubKeyCredAlgs: pendingRequest.pubKeyCredAlgs,
          excludeCredentialIds: pendingRequest.excludeCredentialIds,
          crossOrigin: pendingRequest.crossOrigin,
        },
        items,
      );

      const now = new Date().toISOString();
      const newItem: VaultItem = {
        id: record.itemId,
        title: record.rpName || record.rpId,
        username: record.userName,
        password: '',
        url: pendingRequest.origin,
        notes: '',
        createdAt: now,
        updatedAt: now,
        category: 'passkey',
        ...recordToVaultFields(record),
      };

      await onSaveItem(newItem);
      if (pendingRequest.source === 'android-credential-provider') {
        completeAndroidPasskeyRequest(pendingRequest.requestId, JSON.stringify(credential));
      } else {
        await resolveExtensionPasskeyRequest(pendingRequest.requestId, {
          status: 'ok',
          credential,
        });
      }
      onNotify?.({
        title: record.rpName || record.rpId,
        message: record.userName,
        type: 'success',
      });
      setPendingRequest(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'passkey.create.failed';
      setErrorMessage(message);
    } finally {
      setBusy(false);
    }
  }, [pendingRequest, items, onSaveItem, onNotify]);

  const approveGet = useCallback(async (selectedRecord: PasskeyRecord) => {
    if (!pendingRequest || pendingRequest.kind !== 'get') return;
    setBusy(true);
    setErrorMessage(null);
    try {
      const { updatedRecord, credential } = await signSoftwarePasskeyAssertion(selectedRecord, {
        requestId: pendingRequest.requestId,
        origin: pendingRequest.origin,
        rpId: pendingRequest.rpId,
        challengeBase64Url: pendingRequest.challengeBase64Url,
        allowCredentialIds: pendingRequest.allowCredentialIds,
        crossOrigin: pendingRequest.crossOrigin,
      });

      const existing = items.find((item) => item.id === selectedRecord.itemId);
      if (existing) {
        const now = updatedRecord.lastUsedAt || new Date().toISOString();
        await onSaveItem({
          ...existing,
          passkeySignCount: updatedRecord.signCount,
          passkeyLastUsedAt: now,
          updatedAt: now,
        });
      }

      if (pendingRequest.source === 'android-credential-provider') {
        completeAndroidPasskeyRequest(pendingRequest.requestId, JSON.stringify(credential));
      } else {
        await resolveExtensionPasskeyRequest(pendingRequest.requestId, {
          status: 'ok',
          credential,
        });
      }
      setPendingRequest(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'passkey.authenticate.failed';
      setErrorMessage(message);
    } finally {
      setBusy(false);
    }
  }, [pendingRequest, items, onSaveItem]);

  const fallbackToDevice = useCallback(async () => {
    if (!pendingRequest) return;
    setBusy(true);
    try {
      if (pendingRequest.source === 'android-credential-provider') {
        cancelAndroidPasskeyRequest(pendingRequest.requestId);
      } else {
        await resolveExtensionPasskeyRequest(pendingRequest.requestId, {
          status: 'fallback',
          fallback: true,
        });
      }
    } finally {
      setBusy(false);
      setErrorMessage(null);
      setPendingRequest(null);
    }
  }, [pendingRequest]);

  const cancelRequest = useCallback(async () => {
    if (!pendingRequest) return;
    setBusy(true);
    try {
      if (pendingRequest.source === 'android-credential-provider') {
        cancelAndroidPasskeyRequest(pendingRequest.requestId);
      } else {
        await resolveExtensionPasskeyRequest(pendingRequest.requestId, {
          status: 'cancelled',
          fallback: false,
        });
      }
    } finally {
      setBusy(false);
      setErrorMessage(null);
      setPendingRequest(null);
    }
  }, [pendingRequest]);

  return {
    pendingPasskeyRequest: pendingRequest,
    matchingPasskeyRecords: matchingRecords,
    passkeyRequestBusy: busy,
    passkeyRequestError: errorMessage,
    approvePasskeyCreate: approveCreate,
    approvePasskeyGet: approveGet,
    fallbackPasskeyToDevice: fallbackToDevice,
    cancelPasskeyRequest: cancelRequest,
  };
}
