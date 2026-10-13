/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, KeyRound, Download } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface LockScreenSecretKeySectionProps {
  secretKey: string;
  setSecretKey: (val: string) => void;
  isSetup: boolean;
  requiresSecretKey: boolean;
  /**
   * Whether this platform can actually store the key. `rememberAccountSecretKey`
   * writes through `window.KalderaShieldAndroidSecureStorage`, which only the
   * Android WebView injects; everywhere else it fails closed and returns false.
   */
  canRememberSecretKey: boolean;
  rememberSecretKey: boolean;
  setRememberSecretKey: (val: boolean) => void;
  onDownloadEmergencyKit: () => void | Promise<void>;
}

export function LockScreenSecretKeySection({
  secretKey,
  setSecretKey,
  isSetup,
  requiresSecretKey,
  canRememberSecretKey,
  rememberSecretKey,
  setRememberSecretKey,
  onDownloadEmergencyKit,
}: LockScreenSecretKeySectionProps) {
  const { t } = useLanguage();

  if (isSetup && !requiresSecretKey) {
    return null;
  }

  /**
   * First-time setup on a platform that cannot keep the key: render nothing.
   *
   * The section used to render here anyway -- field, "cannot be remembered"
   * warning and the emergency kit button. Every part of that is a promise the
   * platform cannot keep: the field was mandatory, and the kit exported a key
   * that `setupMasterPasswordWithSecretKey` then discarded, so the vault it
   * described did not exist.
   *
   * A vault that genuinely requires a key keeps the section even where the
   * platform cannot store one -- that key was sealed in somewhere else, and the
   * emergency kit is the only way to get it back.
   */
  if (!isSetup && !requiresSecretKey && !canRememberSecretKey) {
    return null;
  }

  return (
    <div className="rounded-2xl glass-panel p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
          <KeyRound className="w-4.5 h-4.5" />
        </div>
        <div className="text-left">
          <p className="text-xs font-bold text-on-surface">{t('lock.secret.title')}</p>
        </div>
      </div>

      <label className="block">
        <span className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          {t('lock.secret.label')}
        </span>
        <input
          data-testid="lock-secret-key-input"
          type="text"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          readOnly={!isSetup}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          data-bwignore="true"
          data-form-type="other"
          className="w-full bg-surface-lowest border border-outline-variant/30 rounded-xl px-3 py-2.5 sm:py-3 text-on-surface focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all text-center tracking-wider text-xs font-mono"
          placeholder="A3-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          required={requiresSecretKey}
        />
      </label>

      {/* The checkbox is not rendered where the key cannot actually be
          stored. It used to appear on every platform, and accepting it stored
          nothing: `rememberAccountSecretKey` failed closed outside Android, so
          the profile was written anyway and the key became mandatory on every
          later unlock while the UI promised it would be remembered. Offering a
          promise the platform cannot keep is worse than not offering it. */}
      {canRememberSecretKey ? (
        <label className="flex items-start gap-2 text-left text-[11px] text-on-surface-variant cursor-pointer">
          <input
            data-testid="lock-remember-secret-key-checkbox"
            type="checkbox"
            checked={rememberSecretKey}
            onChange={(e) => setRememberSecretKey(e.target.checked)}
            className="mt-0.5 accent-brand-primary cursor-pointer"
          />
          <span>
            {t('lock.secret.rememberThisDevice')}
          </span>
        </label>
      ) : (
        <div
          data-testid="lock-secret-key-no-secure-store"
          className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2 text-left"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-400/90 leading-relaxed">
            {t('lock.secret.noSecureStore')}
          </p>
        </div>
      )}

      {!isSetup && (
        <button
          data-testid="lock-emergency-kit-button"
          type="button"
          onClick={onDownloadEmergencyKit}
          className="w-full flex items-center justify-center gap-2 text-xs font-bold border border-brand-primary/25 bg-brand-primary/10 hover:bg-brand-primary/15 text-brand-primary py-2.5 sm:py-3 rounded-xl transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>{t('lock.secret.downloadEmergencyKit')}</span>
        </button>
      )}
    </div>
  );
}
