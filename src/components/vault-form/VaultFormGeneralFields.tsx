/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Globe, Plus, Shield, Sparkle, Trash2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';


interface VaultFormGeneralFieldsProps {
  title: string;
  url: string;
  onTitleChange: (value: string) => void;
  onUrlChange: (value: string) => void;
  additionalUrls?: string[];
  onAdditionalUrlsChange?: (urls: string[]) => void;
}

export function VaultFormGeneralFields({
  title,
  url,
  onTitleChange,
  onUrlChange,
  additionalUrls = [],
  onAdditionalUrlsChange,
}: VaultFormGeneralFieldsProps) {
  const { t } = useLanguage();
  return (
    <div className="bg-surface-low/50 p-3 sm:p-4 rounded-xl border border-outline-variant/10 space-y-4">
      <h4 className="text-[10px] font-bold text-brand-primary tracking-widest uppercase flex items-center gap-1.5">
        <Sparkle className="w-3.5 h-3.5 fill-current" />
        <span>{t('vaultForm.general.title')}</span>
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.field.title')}
          </label>
          <div className="relative">
            <Shield className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              data-testid="vault-item-title-input"
              type="text"
              required
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-semibold"
              placeholder={t('vaultForm.placeholder.title')}
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.field.url')}
          </label>
          <div className="relative">
            <Globe className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              data-testid="vault-item-url-input"
              type="text"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
              placeholder={t('vaultForm.placeholder.url')}
            />
          </div>
        </div>
      </div>

      {onAdditionalUrlsChange && (
        <div className="space-y-2 pt-1">
          {additionalUrls.map((extraUrl, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Globe className="w-3.5 h-3.5 absolute left-3 top-3 text-on-surface-variant/40" />
                <input
                  data-testid={`vault-item-additional-url-input-${idx}`}
                  type="text"
                  value={extraUrl}
                  onChange={(e) => {
                    const next = [...additionalUrls];
                    next[idx] = e.target.value;
                    onAdditionalUrlsChange(next);
                  }}
                  className="w-full bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-on-surface focus:ring-1 focus:ring-brand-primary/30 focus:outline-none"
                  placeholder={t('vaultForm.additionalUrlPlaceholder')}
                />
              </div>
              <button
                type="button"
                onClick={() => onAdditionalUrlsChange(additionalUrls.filter((_, i) => i !== idx))}
                className="p-2 rounded-lg bg-surface-lowest hover:bg-brand-error/10 border border-outline-variant/20 text-on-surface-variant hover:text-brand-error transition-colors cursor-pointer"
                title={t('vaultForm.removeField')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            data-testid="vault-item-add-url-button"
            onClick={() => onAdditionalUrlsChange([...additionalUrls, ''])}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-primary hover:underline cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('vaultForm.addAdditionalUrl')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
