/**
 * @file SharePasswordPrompt.tsx
 * @description The prompt shown when a share link is opened.
 *
 * `useShareReceive` detects `#share=` in the URL hash and holds the payload
 * there until a password is supplied — the link's key material is
 * password-derived (`share.ts:deriveShareKey`), so nothing can be decrypted
 * without it. This component is what asks for that password.
 *
 * It was previously missing: the hook computed `isSharePasswordPromptOpen`,
 * `shareReceiveError` and `submitSharePassword`, but nothing rendered them, so
 * opening a share link did nothing at all — the recipient saw no prompt and no
 * error. `useShareReceive.test.tsx` passed because it asserts hook state
 * directly, never that a prompt exists on screen.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertTriangle, Download, Lock } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface SharePasswordPromptProps {
  isOpen: boolean;
  error: string | null;
  onSubmit: (password: string) => void | Promise<void>;
  onCancel: () => void;
}

export default function SharePasswordPrompt({ isOpen, error, onSubmit, onCancel }: SharePasswordPromptProps) {
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(password);
    } finally {
      // Cleared unconditionally: on success the prompt closes, and on failure
      // `submitSharePassword` owns the message. Either way the password must not
      // stay sitting in the field after the attempt.
      setPassword('');
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onCancel} zIndex={110}>
      {/* Keyed on `isOpen` so a closed prompt unmounts its form and the next
          one starts with an empty field. A password left in `useState` after
          the prompt closes would sit in memory until the next mount, and the
          previous link's password would pre-fill the next one. */}
      <div key={String(isOpen)} className="w-full max-w-md bg-surface-container border border-outline-variant/30 rounded-2xl overflow-hidden custom-shadow relative flex flex-col mx-4">
        <div className="absolute top-0 left-0 w-full h-1 bg-brand-primary" />

        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-outline-variant/10 bg-[#0c0d0c]/95">
          <div className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
            <Download className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-sm text-on-surface">
              {t('share.passwordPromptTitle', 'Password Required')}
            </h3>
            <p className="text-[10px] text-on-surface-variant font-medium">
              {t('share.passwordPromptSubtitle', 'Enter the password you received to open this link.')}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5 text-left">
            <label
              htmlFor="share-receive-password"
              className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest"
            >
              {t('share.passwordLabel', 'Share Password')}
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant/50" />
              <input
                id="share-receive-password"
                data-testid="receive-share-password-input"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                placeholder={t('share.receivePasswordPlaceholder', 'Enter the share password')}
                className="w-full bg-[#161816] border border-outline-variant/20 rounded-xl pl-9 pr-3 py-2.5 text-xs text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              data-testid="receive-share-error"
              className="p-3 bg-brand-error/10 border border-brand-error/20 rounded-lg text-brand-error text-xs flex gap-2 items-center"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="submit"
              data-testid="receive-share-unlock-button"
              variant="primary"
              size="md"
              className="flex-1"
              disabled={isSubmitting || password.length === 0}
            >
              {t('share.unlockButton', 'Unlock Link')}
            </Button>
            <Button
              type="button"
              data-testid="receive-share-cancel-button"
              variant="ghost"
              size="md"
              onClick={onCancel}
            >
              {t('share.cancel', 'Cancel')}
            </Button>
          </div>

          <p className="text-[9px] text-on-surface-variant/60 leading-relaxed text-left">
            {t('share.receivePasswordHelp', 'This link is encrypted with a password the sender chose. It never left the link you were sent.')}
          </p>
        </form>
      </div>
    </Modal>
  );
}