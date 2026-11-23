/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Desktop approval dialog for WebAuthn passkey create/get requests coming from
 * the browser extension over the AEAD native-messaging channel.
 */

import { useState } from 'react';
import { Fingerprint, Globe, KeyRound, ShieldCheck, User, X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import type { PasskeyRecord } from '../lib/passkey';
import type { ExtensionPasskeyRequest } from '../hooks/useExtensionPasskeyListener';
import { Modal } from './ui/Modal';

export interface ExtensionPasskeyModalProps {
  request: ExtensionPasskeyRequest | null;
  matchingRecords: PasskeyRecord[];
  busy?: boolean;
  errorMessage?: string | null;
  onApproveCreate: () => void | Promise<void>;
  onApproveGet: (record: PasskeyRecord) => void | Promise<void>;
  onFallbackToDevice: () => void | Promise<void>;
  onCancel: () => void | Promise<void>;
}

export function ExtensionPasskeyModal({
  request,
  matchingRecords,
  busy = false,
  errorMessage = null,
  onApproveCreate,
  onApproveGet,
  onFallbackToDevice,
  onCancel,
}: ExtensionPasskeyModalProps) {
  const { t } = useLanguage();
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>('');

  if (!request) return null;

  const isCreate = request.kind === 'create';
  const selectedRecord = matchingRecords.find((r) => r.credentialId === selectedCredentialId)
    ?? matchingRecords[0]
    ?? null;

  return (
    <Modal open={Boolean(request)} onClose={onCancel} zIndex={120} className="safe-modal">
      <div
        data-testid="extension-passkey-modal"
        className="w-full max-w-md bg-surface-container border border-outline-variant/30 rounded-2xl overflow-hidden custom-shadow relative"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-brand-primary" />

        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-primary/15 border border-brand-primary/25 flex items-center justify-center shrink-0">
                <Fingerprint className="w-5 h-5 text-brand-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-on-surface">
                  {isCreate ? t('passkey.extension.createTitle') : t('passkey.extension.getTitle')}
                </h3>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {isCreate ? t('passkey.extension.createDescription') : t('passkey.extension.getDescription')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              aria-label={t('passkey.create.cancel')}
              className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg transition cursor-pointer disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="rounded-xl border border-outline-variant/20 bg-surface-low p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-on-surface-variant flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-brand-primary" />
                {t('passkey.list.rpId')}
              </span>
              <span data-testid="extension-passkey-rpid" className="font-mono font-semibold text-on-surface break-all">
                {request.rpId}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-on-surface-variant">Origin</span>
              <span data-testid="extension-passkey-origin" className="font-mono text-on-surface-variant break-all">
                {request.origin}
              </span>
            </div>
            {isCreate && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-variant/15">
                <span className="text-on-surface-variant flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-brand-primary" />
                  {t('passkey.list.userName')}
                </span>
                <span data-testid="extension-passkey-username" className="font-mono text-on-surface break-all">
                  {request.userName || request.userDisplayName || request.rpId}
                </span>
              </div>
            )}
          </div>

          {!isCreate && (
            <div className="space-y-2">
              {matchingRecords.length === 0 ? (
                <p className="text-xs text-amber-300 border border-amber-500/25 bg-amber-500/10 rounded-xl p-3">
                  {t('passkey.extension.noMatchingPasskey')}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto" role="radiogroup">
                  {matchingRecords.map((record) => {
                    const checked = selectedRecord?.credentialId === record.credentialId;
                    return (
                      <button
                        key={record.credentialId}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        data-testid="extension-passkey-option"
                        onClick={() => setSelectedCredentialId(record.credentialId)}
                        className={
                          'w-full text-left rounded-xl border p-3 transition flex items-center justify-between gap-2 cursor-pointer '
                          + (checked
                            ? 'border-brand-primary bg-brand-primary/10'
                            : 'border-outline-variant/20 bg-surface-low hover:border-outline-variant/40')
                        }
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-on-surface truncate">
                            {record.userName || record.rpName}
                          </div>
                          <div className="text-[10px] font-mono text-on-surface-variant truncate">
                            {record.rpId} · {record.algorithm}
                          </div>
                        </div>
                        <KeyRound className="w-4 h-4 text-brand-primary shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {errorMessage && (
            <p role="alert" className="text-xs text-red-400 border border-red-500/25 bg-red-500/10 rounded-xl p-2.5">
              {errorMessage}
            </p>
          )}

          <div className="flex flex-col gap-2 pt-1">
            {isCreate ? (
              <button
                type="button"
                data-testid="extension-passkey-approve-create"
                disabled={busy}
                onClick={onApproveCreate}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold bg-brand-primary text-black hover:brightness-110 transition disabled:opacity-40 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{t('passkey.extension.approveCreate')}</span>
              </button>
            ) : (
              <button
                type="button"
                data-testid="extension-passkey-approve-get"
                disabled={busy || !selectedRecord}
                onClick={() => selectedRecord && onApproveGet(selectedRecord)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold bg-brand-primary text-black hover:brightness-110 transition disabled:opacity-40 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{t('passkey.extension.approveGet')}</span>
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="extension-passkey-fallback"
                disabled={busy}
                onClick={onFallbackToDevice}
                className="rounded-xl px-3 py-2 text-xs font-semibold border border-outline-variant/25 bg-surface-low text-on-surface hover:bg-surface-high transition disabled:opacity-40 cursor-pointer"
              >
                {t('passkey.extension.useDevice')}
              </button>
              <button
                type="button"
                data-testid="extension-passkey-cancel"
                disabled={busy}
                onClick={onCancel}
                className="rounded-xl px-3 py-2 text-xs font-semibold border border-outline-variant/20 text-on-surface-variant hover:text-on-surface transition disabled:opacity-40 cursor-pointer"
              >
                {t('passkey.create.cancel')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
