/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ListPlus, Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { secureRandomToken } from '../../lib/random';
import type { VaultCustomField } from '../../types';

interface VaultFormCustomFieldsSectionProps {
  fields: VaultCustomField[];
  onChange: (fields: VaultCustomField[]) => void;
}

export function VaultFormCustomFieldsSection({
  fields,
  onChange,
}: VaultFormCustomFieldsSectionProps) {
  const { t } = useLanguage();

  const handleAddField = () => {
    onChange([
      ...fields,
      {
        id: `cf_${secureRandomToken(6)}`,
        label: '',
        value: '',
        type: 'text',
      },
    ]);
  };

  const handleUpdateField = (
    idx: number,
    patch: Partial<VaultCustomField>,
  ) => {
    const next = fields.map((field, i) => (i === idx ? { ...field, ...patch } : field));
    onChange(next);
  };

  const handleRemoveField = (idx: number) => {
    onChange(fields.filter((_, i) => i !== idx));
  };

  return (
    <div className="bg-surface-low/50 p-3 sm:p-4 rounded-xl border border-outline-variant/10 space-y-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[10px] font-bold text-on-surface-variant tracking-widest uppercase flex items-center gap-1.5">
          <ListPlus className="w-3.5 h-3.5 text-brand-primary" />
          <span>{t('vaultForm.customFields.title')}</span>
        </h4>
        <button
          type="button"
          data-testid="vault-item-add-custom-field-button"
          onClick={handleAddField}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-primary hover:underline cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('vaultForm.customFields.add')}</span>
        </button>
      </div>

      {fields.length > 0 && (
        <div className="space-y-2.5">
          {fields.map((field, idx) => (
            <div
              key={field.id}
              className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 items-center"
            >
              <input
                type="text"
                data-testid={`vault-custom-field-label-${idx}`}
                value={field.label}
                onChange={(e) => handleUpdateField(idx, { label: e.target.value })}
                placeholder={t('vaultForm.customFields.labelPlaceholder')}
                className="bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-primary/35"
              />
              <input
                type={field.type === 'hidden' ? 'password' : 'text'}
                data-testid={`vault-custom-field-value-${idx}`}
                value={field.value}
                onChange={(e) => handleUpdateField(idx, { value: e.target.value })}
                placeholder={t('vaultForm.customFields.valuePlaceholder')}
                className="bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-xs font-mono text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-primary/35"
              />
              <select
                value={field.type}
                onChange={(e) =>
                  handleUpdateField(idx, { type: e.target.value as VaultCustomField['type'] })
                }
                aria-label={t('vaultForm.customFields.typeLabel')}
                className="bg-surface-lowest border border-outline-variant/20 rounded-lg px-2.5 py-2 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-primary/35"
              >
                <option value="text">{t('vaultForm.customFields.typeText')}</option>
                <option value="hidden">{t('vaultForm.customFields.typeHidden')}</option>
                <option value="url">{t('vaultForm.customFields.typeUrl')}</option>
              </select>
              <button
                type="button"
                onClick={() => handleRemoveField(idx)}
                className="p-2 rounded-lg bg-surface-lowest hover:bg-brand-error/10 border border-outline-variant/20 text-on-surface-variant hover:text-brand-error transition-colors cursor-pointer justify-self-end"
                title={t('vaultForm.removeField')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
