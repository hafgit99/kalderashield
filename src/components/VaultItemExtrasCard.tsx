/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Check, Copy, Eye, EyeOff, Globe, KeyRound, ListPlus } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import type { VaultItem } from '../types';

interface VaultItemExtrasCardProps {
  item: VaultItem;
  copiedField: string | null;
  onCopyText: (text: string, field: string) => void;
}

export default function VaultItemExtrasCard({
  item,
  copiedField,
  onCopyText,
}: VaultItemExtrasCardProps) {
  const { t } = useLanguage();
  const [revealedCustomFields, setRevealedCustomFields] = useState<Record<string, boolean>>({});
  const [areRecoveryCodesRevealed, setAreRecoveryCodesRevealed] = useState(false);

  const additionalUrls = (item.additionalUrls ?? []).filter((u) => u.trim().length > 0);
  const customFields = (item.customFields ?? []).filter(
    (field) => field.label.trim().length > 0 || field.value.trim().length > 0,
  );
  const recoveryCodes = (item.totpRecoveryCodes ?? []).filter((code) => code.trim().length > 0);

  if (additionalUrls.length === 0 && customFields.length === 0 && recoveryCodes.length === 0) {
    return null;
  }

  const toggleCustomFieldReveal = (key: string) => {
    setRevealedCustomFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {additionalUrls.length > 0 && (
        <div
          data-testid="vault-item-additional-urls-card"
          className="glass-panel p-4 sm:p-5 rounded-xl space-y-2.5 text-left"
        >
          <h4 className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-brand-primary" />
            <span>{t('detail.extras.additionalUrls')}</span>
          </h4>
          <div className="space-y-1.5">
            {additionalUrls.map((extraUrl, idx) => {
              const fieldId = `additional_url_${idx}`;
              return (
                <div
                  key={`${extraUrl}-${idx}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-surface-lowest border border-outline-variant/15"
                >
                  <span className="font-mono text-xs text-on-surface truncate">{extraUrl}</span>
                  <button
                    type="button"
                    onClick={() => onCopyText(extraUrl, fieldId)}
                    className="p-1.5 rounded-lg text-on-surface-variant hover:text-brand-primary hover:bg-surface-high/60 transition-colors cursor-pointer shrink-0"
                    title={t('loginDetail.copy')}
                  >
                    {copiedField === fieldId ? (
                      <Check className="w-3.5 h-3.5 text-brand-tertiary" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {customFields.length > 0 && (
        <div
          data-testid="vault-item-custom-fields-card"
          className="glass-panel p-4 sm:p-5 rounded-xl space-y-2.5 text-left"
        >
          <h4 className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase flex items-center gap-1.5">
            <ListPlus className="w-3.5 h-3.5 text-brand-primary" />
            <span>{t('detail.extras.customFields')}</span>
          </h4>
          <div className="space-y-2">
            {customFields.map((field, idx) => {
              const key = field.id || `cf-${idx}`;
              const fieldId = `custom_field_${key}`;
              const isHidden = field.type === 'hidden';
              const isVisible = !isHidden || Boolean(revealedCustomFields[key]);
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg bg-surface-lowest border border-outline-variant/15"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                      {field.label || t('detail.extras.customFieldUnnamed')}
                    </div>
                    <div className="text-xs font-mono text-on-surface break-all mt-0.5">
                      {isVisible ? field.value : '••••••••••••'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isHidden && (
                      <button
                        type="button"
                        onClick={() => toggleCustomFieldReveal(key)}
                        className="p-1.5 rounded-lg text-on-surface-variant hover:text-brand-primary hover:bg-surface-high/60 transition-colors cursor-pointer"
                        title={isVisible ? t('loginDetail.hide') : t('loginDetail.show')}
                      >
                        {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onCopyText(field.value, fieldId)}
                      className="p-1.5 rounded-lg text-on-surface-variant hover:text-brand-primary hover:bg-surface-high/60 transition-colors cursor-pointer"
                      title={t('loginDetail.copy')}
                    >
                      {copiedField === fieldId ? (
                        <Check className="w-3.5 h-3.5 text-brand-tertiary" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {recoveryCodes.length > 0 && (
        <div
          data-testid="vault-item-recovery-codes-card"
          className="glass-panel p-4 sm:p-5 rounded-xl space-y-2.5 text-left"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[10px] font-bold tracking-wider text-on-surface-variant uppercase flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-brand-primary" />
              <span>{t('detail.extras.recoveryCodes')}</span>
            </h4>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setAreRecoveryCodesRevealed((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-on-surface-variant hover:text-brand-primary cursor-pointer"
              >
                {areRecoveryCodesRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{areRecoveryCodesRevealed ? t('loginDetail.hide') : t('loginDetail.show')}</span>
              </button>
              <button
                type="button"
                onClick={() => onCopyText(recoveryCodes.join('\n'), 'totp_recovery_all')}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-primary hover:underline cursor-pointer"
              >
                {copiedField === 'totp_recovery_all' ? (
                  <Check className="w-3.5 h-3.5 text-brand-tertiary" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{t('loginDetail.copy')}</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {recoveryCodes.map((code, idx) => {
              const fieldId = `totp_recovery_${idx}`;
              return (
                <div
                  key={`${code}-${idx}`}
                  className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-surface-lowest border border-outline-variant/15"
                >
                  <span className="font-mono text-xs text-on-surface truncate">
                    {areRecoveryCodesRevealed ? code : '••••-••••'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onCopyText(code, fieldId)}
                    className="p-1 rounded text-on-surface-variant hover:text-brand-primary cursor-pointer shrink-0"
                    title={t('loginDetail.copy')}
                  >
                    {copiedField === fieldId ? (
                      <Check className="w-3 h-3 text-brand-tertiary" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
