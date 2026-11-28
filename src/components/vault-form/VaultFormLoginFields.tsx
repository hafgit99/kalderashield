/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, KeyRound, Wand2, Eye, EyeOff, QrCode, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { parseGoogleAuthenticatorMigrationUri } from '../../lib/otpMigration';
import { PasswordStrengthMeter } from '../common/PasswordStrengthMeter';

interface DetectedBarcode {
  rawValue?: string;
}

interface NativeBarcodeDetector {
  detect: (source: ImageBitmapSource) => Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
}

interface VaultFormLoginFieldsProps {
  username: string;
  onUsernameChange: (val: string) => void;
  password: string;
  onPasswordChange: (val: string) => void;
  isPasswordVisible: boolean;
  onTogglePasswordVisibility: () => void;
  onAutoGeneratePassword: () => void;
  totpSecret: string;
  onTotpSecretChange: (val: string) => void;
  totpRecoveryCodes?: string[];
  onTotpRecoveryCodesChange?: (codes: string[]) => void;
}

export function VaultFormLoginFields({
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  isPasswordVisible,
  onTogglePasswordVisibility,
  onAutoGeneratePassword,
  totpSecret,
  onTotpSecretChange,
  totpRecoveryCodes = [],
  onTotpRecoveryCodesChange,
}: VaultFormLoginFieldsProps) {
  const { t } = useLanguage();
  const [qrStatusMessage, setQrStatusMessage] = useState<string | null>(null);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(totpRecoveryCodes.length > 0);

  const applyScannedOtpValue = (rawValue: string): boolean => {
    const trimmed = rawValue.trim();
    if (!trimmed) return false;
    if (trimmed.toLowerCase().startsWith('otpauth-migration://')) {
      const migrated = parseGoogleAuthenticatorMigrationUri(trimmed);
      if (migrated.length > 0 && migrated[0]?.otpauthUri) {
        onTotpSecretChange(migrated[0].otpauthUri);
        return true;
      }
      return false;
    }
    if (trimmed.toLowerCase().startsWith('otpauth://totp/')) {
      onTotpSecretChange(trimmed);
      return true;
    }
    return false;
  };

  const handleTotpInputChange = (raw: string) => {
    setQrStatusMessage(null);
    if (raw.trim().toLowerCase().startsWith('otpauth-migration://')) {
      if (applyScannedOtpValue(raw)) return;
    }
    onTotpSecretChange(raw);
  };

  const handleScanQrImage = () => {
    setQrStatusMessage(null);
    const DetectorCtor = (
      globalThis as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector;
    if (!DetectorCtor) {
      setQrStatusMessage(t('vaultForm.login.totpQrUnsupported'));
      return;
    }

    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      try {
        const bitmap = await createImageBitmap(file);
        try {
          const detector = new DetectorCtor({ formats: ['qr_code'] });
          const results = await detector.detect(bitmap);
          const match = results.find((entry) => entry.rawValue && applyScannedOtpValue(entry.rawValue));
          if (!match) {
            setQrStatusMessage(t('vaultForm.login.totpQrNotFound'));
          }
        } finally {
          bitmap.close?.();
        }
      } catch {
        setQrStatusMessage(t('vaultForm.login.totpQrNotFound'));
      }
    };
    picker.click();
  };

  return (
    <div className="space-y-4 animate-fade-in text-left">
      <div className="border-l-2 border-brand-primary pl-3.5 py-0.5">
        <h4 className="text-xs font-bold text-on-surface">{t('vaultForm.login.title')}</h4>
        <p className="text-[10px] text-on-surface-variant">{t('vaultForm.login.description')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.login.username')}
          </label>
          <div className="relative">
            <User className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              data-testid="vault-item-username-input"
              type="text"
              required
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface"
              placeholder={t('vaultForm.login.usernamePlaceholder')}
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5 flex justify-between items-center">
            <span>{t('vaultForm.login.password')}</span>
            <button
              type="button"
              onClick={onAutoGeneratePassword}
              className="text-[9px] text-brand-primary hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              <Wand2 className="w-3 h-3" />
              <span>{t('vaultForm.login.generateStrong')}</span>
            </button>
          </label>
          <div className="relative">
            <KeyRound className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              data-testid="vault-item-password-input"
              type={isPasswordVisible ? 'text' : 'password'}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-kalderashield-ignore="true"
              data-form-type="other"
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-20 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
              placeholder={t('vaultForm.login.passwordPlaceholder')}
            />
            <div className="absolute right-3 top-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={onTogglePasswordVisibility}
                className="text-on-surface-variant hover:text-brand-primary transition-colors p-1.5 cursor-pointer"
                title={isPasswordVisible ? t('vaultForm.login.hide') : t('vaultForm.login.show')}
              >
                {isPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={onAutoGeneratePassword}
                className="text-on-surface-variant hover:text-brand-primary transition-colors p-1.5 cursor-pointer"
                title={t('vaultForm.login.generatePasswordTitle')}
              >
                <Wand2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Dynamic Real-time Password Strength Meter */}
          {password && <PasswordStrengthMeter password={password} />}
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5 flex justify-between items-center gap-2">
          <span>{t('vaultForm.login.totp')}</span>
          <button
            type="button"
            data-testid="totp-qr-scan-button"
            onClick={handleScanQrImage}
            className="text-[10px] font-semibold text-brand-primary hover:underline flex items-center gap-1 cursor-pointer normal-case tracking-normal shrink-0"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>{t('vaultForm.login.totpScanQr')}</span>
          </button>
        </label>
        <div className="relative">
          <KeyRound className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
          <input
            type="text"
            value={totpSecret}
            onChange={(e) => handleTotpInputChange(e.target.value)}
            className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
            placeholder={t('vaultForm.login.totpPlaceholder')}
          />
        </div>
        {qrStatusMessage && (
          <p className="mt-1.5 text-[11px] text-brand-secondary">{qrStatusMessage}</p>
        )}
      </div>

      {onTotpRecoveryCodesChange && (
        <div className="pt-0.5">
          {!showRecoveryCodes && totpRecoveryCodes.length === 0 ? (
            <button
              type="button"
              data-testid="totp-recovery-codes-toggle"
              onClick={() => setShowRecoveryCodes(true)}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant hover:text-brand-primary cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{t('vaultForm.login.addRecoveryCodes')}</span>
            </button>
          ) : (
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest">
                {t('vaultForm.login.recoveryCodesLabel')}
              </label>
              <textarea
                data-testid="totp-recovery-codes-textarea"
                rows={3}
                value={totpRecoveryCodes.join('\n')}
                onChange={(e) =>
                  onTotpRecoveryCodesChange(
                    e.target.value.split(/\r?\n/),
                  )
                }
                placeholder={t('vaultForm.login.recoveryCodesPlaceholder')}
                className="w-full bg-surface-lowest border border-outline-variant/20 rounded-xl px-3.5 py-2 text-xs font-mono text-on-surface focus:ring-1 focus:ring-brand-primary/30 focus:outline-none"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
