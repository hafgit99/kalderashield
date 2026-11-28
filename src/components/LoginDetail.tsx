import { useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff, ShieldAlert } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { generateTOTP, getTotpPeriod, TOTPValidationError } from '../lib/otp';
import { supportsTwoFactor } from '../lib/security';
import type { VaultItem } from '../types';
import { TotpCountdownRing } from './totp/TotpCountdownRing';

import { useSensitiveRevealContext } from '../context/SensitiveRevealContext';
import { ColoredPassword } from './common/ColoredPassword';

interface LoginDetailProps {
  item: VaultItem;
  copiedField: string | null;
  isPasswordRevealed?: boolean;
  totpCountdown: number;
  onTogglePasswordReveal?: () => void;
  onCopyText: (text: string, field: string) => void;
  onEdit?: () => void;
}

export default function LoginDetail({
  item,
  copiedField,
  isPasswordRevealed: propIsPasswordRevealed,
  totpCountdown,
  onTogglePasswordReveal: propOnTogglePasswordReveal,
  onCopyText,
  onEdit,
}: LoginDetailProps) {
  const { t } = useLanguage();
  const revealCtx = useSensitiveRevealContext();
  const isPasswordRevealed = propIsPasswordRevealed ?? revealCtx.revealed.password;
  const onTogglePasswordReveal = propOnTogglePasswordReveal ?? (() => revealCtx.toggleReveal('password'));
  const [totpCode, setTotpCode] = useState<string>('');
  const [nextTotpCode, setNextTotpCode] = useState<string>('');
  const [hasTotpValidationError, setHasTotpValidationError] = useState<boolean>(false);
  const totpPeriod = getTotpPeriod(item.totpSecret);

  useEffect(() => {
    let active = true;
    if (item.category === 'login' && item.totpSecret) {
      const nowMs = Date.now();
      Promise.all([
        generateTOTP(item.totpSecret, { timestampMs: nowMs }),
        generateTOTP(item.totpSecret, { timestampMs: nowMs + totpPeriod * 1000 }),
      ])
        .then(([code, nextCode]) => {
          if (active) {
            setTotpCode(code);
            setNextTotpCode(nextCode);
            setHasTotpValidationError(false);
          }
        })
        .catch((error) => {
          if (active) {
            const isValidationError = error instanceof TOTPValidationError || (error instanceof Error && error.name === 'TOTPValidationError');
            setHasTotpValidationError(Boolean(isValidationError));
            if (isValidationError) {
              setTotpCode('000 000');
              setNextTotpCode('');
            }
          }
        });
    } else {
      setTotpCode('');
      setNextTotpCode('');
      setHasTotpValidationError(false);
    }
    return () => {
      active = false;
    };
  }, [item.category, item.totpSecret, totpCountdown, totpPeriod]);

  if (item.category !== 'login') return null;

  return (
    <div className="space-y-4">
      <div className="glass-panel p-5 rounded-xl">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          {t('loginDetail.username')}
        </label>
        <div className="flex items-center justify-between">
          <span data-testid="login-username-value" className="font-bold text-base text-on-surface break-all">{item.username}</span>
          <button
            data-testid="login-username-copy-button"
            onClick={() => onCopyText(item.username, 'username')}
            className={`p-1.5 rounded-lg cursor-pointer shrink-0 ml-2 transition-all duration-300 focus:outline-none ${
              copiedField === 'username'
                ? 'ring-2 ring-emerald-400/50 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.35)] scale-105'
                : 'text-on-surface-variant hover:text-brand-primary hover:bg-surface-high/60'
            }`}
            title={t('loginDetail.copy')}
          >
            {copiedField === 'username' ? (
              <Check className="w-4 h-4 text-brand-tertiary animate-in zoom-in-50 duration-200" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div className="glass-panel p-5 rounded-xl">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          {t('loginDetail.password')}
        </label>
        <div className="flex items-center justify-between">
          <span data-testid="login-password-value" className="font-mono text-base tracking-wider break-all text-on-surface select-all">
            {isPasswordRevealed
              ? item.password
                ? <ColoredPassword password={item.password} />
                : t('loginDetail.emptyPassword')
              : '••••••••••••••••'}
          </span>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button
              data-testid="login-password-reveal-button"
              onClick={onTogglePasswordReveal}
              className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-surface-high/60 rounded-lg cursor-pointer"
              title={isPasswordRevealed ? t('loginDetail.hide') : t('loginDetail.show')}
            >
              {isPasswordRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              data-testid="login-password-copy-button"
              onClick={() => onCopyText(item.password || '', 'password')}
              className={`p-1.5 rounded-lg cursor-pointer transition-all duration-300 focus:outline-none ${
                copiedField === 'password'
                  ? 'ring-2 ring-emerald-400/50 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.35)] scale-105'
                  : 'text-on-surface-variant hover:text-brand-primary hover:bg-surface-high/60'
              }`}
              title={t('loginDetail.copy')}
            >
              {copiedField === 'password' ? (
                <Check className="w-4 h-4 text-brand-tertiary animate-in zoom-in-50 duration-200" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="glass-panel p-5 rounded-xl">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2 flex justify-between">
          <span>{t('loginDetail.totp')}</span>
          {item.totpSecret && <span className="text-brand-primary font-mono lowercase">{t('loginDetail.mfaActive')}</span>}
        </label>
        <div className="flex items-center justify-between">
          {item.totpSecret ? (
            hasTotpValidationError ? (
              <div className="text-xs text-brand-secondary py-1 text-left leading-relaxed">
                {t('loginDetail.invalidTotp')}
              </div>
            ) : (
              <>
                <div className="flex flex-col">
                  <span className="font-mono text-xl md:text-2xl font-bold text-brand-primary tracking-widest tabular-nums">
                    {totpCode}
                  </span>
                  {totpCountdown <= 5 && nextTotpCode && (
                    <span
                      data-testid="login-totp-next-preview"
                      className="text-[11px] font-mono text-on-surface-variant mt-0.5 tabular-nums"
                    >
                      → {nextTotpCode}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2.5">
                  <TotpCountdownRing secondsLeft={totpCountdown} totalDuration={totpPeriod} />
                  <button
                    type="button"
                    data-testid="login-totp-copy-button"
                    onClick={() => onCopyText(totpCode.replace(' ', ''), 'totp')}
                    className={`p-1.5 rounded-lg cursor-pointer transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
                      copiedField === 'totp'
                        ? 'ring-2 ring-brand-tertiary/50 bg-brand-tertiary/15 text-brand-tertiary scale-105'
                        : 'text-on-surface-variant hover:text-brand-primary hover:bg-surface-high/60'
                    }`}
                    title={t('loginDetail.copyTotp')}
                  >
                    {copiedField === 'totp' ? (
                      <Check className="w-4 h-4 text-brand-tertiary animate-in zoom-in-50 duration-200" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </>
            )
          ) : supportsTwoFactor(item.url) ? (
            <div
              data-testid="login-missing-2fa-alert"
              className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-left"
            >
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  {t('loginDetail.twoFactorMissing')}
                </span>
                <p className="text-[11px] text-amber-200/80 leading-normal">
                  {t('loginDetail.twoFactorMissingDesc')}
                </p>
              </div>
              {onEdit && (
                <button
                  type="button"
                  data-testid="login-add-totp-button"
                  onClick={onEdit}
                  className="px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition-all shrink-0 self-start sm:self-auto cursor-pointer"
                >
                  {t('loginDetail.addTotpAction')}
                </button>
              )}
            </div>
          ) : (
            <div className="text-xs text-on-surface-variant/40 italic py-1 text-left">
              {t('loginDetail.noTotp')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
