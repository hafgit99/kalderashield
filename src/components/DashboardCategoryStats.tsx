import { CreditCard, FileText, Fingerprint, KeyRound, User } from 'lucide-react';

import type { VaultCategoryFilter } from '../hooks/useVaultFilters';
import { useLanguage } from '../i18n/LanguageContext';

interface DashboardCategoryStatsProps {
  loginCount: number;
  cardCount: number;
  secureNoteCount: number;
  passkeyCount?: number;
  identityCount?: number;
  onSelectCategory?: (category: VaultCategoryFilter) => void;
}

export default function DashboardCategoryStats({
  loginCount,
  cardCount,
  secureNoteCount,
  passkeyCount,
  identityCount,
  onSelectCategory,
}: DashboardCategoryStatsProps) {
  const { t } = useLanguage();
  const interactiveClass = onSelectCategory
    ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 active:scale-[0.99]'
    : '';

  const showExtendedCategories = typeof passkeyCount === 'number' || typeof identityCount === 'number';

  return (
    <div className="md:col-span-5 flex flex-col justify-between gap-2.5">
      <button
        type="button"
        data-testid="dashboard-category-login"
        onClick={() => onSelectCategory?.('login')}
        className={`w-full text-left surface-card surface-card-hover px-3.5 py-3 rounded-xl flex items-center justify-between group ${interactiveClass}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="icon-tile bg-brand-primary/10 text-brand-primary shrink-0">
            <KeyRound className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-xs text-on-surface truncate">{t('dashboard.category.logins.title')}</p>
            <p className="text-[11px] text-on-surface-variant truncate">{t('dashboard.category.logins.description')}</p>
          </div>
        </div>
        <span className="font-mono text-sm font-bold text-on-surface bg-surface-high border border-outline-variant/15 px-2.5 py-1 rounded-lg tabular-nums shrink-0">
          {loginCount}
        </span>
      </button>

      <button
        type="button"
        data-testid="dashboard-category-card"
        onClick={() => onSelectCategory?.('card')}
        className={`w-full text-left surface-card surface-card-hover px-3.5 py-3 rounded-xl flex items-center justify-between group ${interactiveClass}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="icon-tile bg-brand-secondary/15 text-brand-secondary shrink-0">
            <CreditCard className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-xs text-on-surface truncate">{t('dashboard.category.cards.title')}</p>
            <p className="text-[11px] text-on-surface-variant truncate">{t('dashboard.category.cards.description')}</p>
          </div>
        </div>
        <span className="font-mono text-sm font-bold text-on-surface bg-surface-high border border-outline-variant/15 px-2.5 py-1 rounded-lg tabular-nums shrink-0">
          {cardCount}
        </span>
      </button>

      <button
        type="button"
        data-testid="dashboard-category-secure_note"
        onClick={() => onSelectCategory?.('secure_note')}
        className={`w-full text-left surface-card surface-card-hover px-3.5 py-3 rounded-xl flex items-center justify-between group ${interactiveClass}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="icon-tile bg-brand-tertiary/10 text-brand-tertiary shrink-0">
            <FileText className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-xs text-on-surface truncate">{t('dashboard.category.notes.title')}</p>
            <p className="text-[11px] text-on-surface-variant truncate">{t('dashboard.category.notes.description')}</p>
          </div>
        </div>
        <span className="font-mono text-sm font-bold text-on-surface bg-surface-high border border-outline-variant/15 px-2.5 py-1 rounded-lg tabular-nums shrink-0">
          {secureNoteCount}
        </span>
      </button>

      {showExtendedCategories && (
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            data-testid="dashboard-category-passkey"
            onClick={() => onSelectCategory?.('passkey')}
            className={`text-left surface-card surface-card-hover px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 group ${interactiveClass}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Fingerprint className="w-4 h-4 text-brand-primary shrink-0" />
              <span className="font-bold text-xs text-on-surface truncate">{t('vaultForm.category.passkey')}</span>
            </div>
            <span className="font-mono text-xs font-bold text-on-surface bg-surface-high border border-outline-variant/15 px-2 py-0.5 rounded-md tabular-nums shrink-0">
              {passkeyCount ?? 0}
            </span>
          </button>

          <button
            type="button"
            data-testid="dashboard-category-identity"
            onClick={() => onSelectCategory?.('identity')}
            className={`text-left surface-card surface-card-hover px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 group ${interactiveClass}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <User className="w-4 h-4 text-brand-secondary shrink-0" />
              <span className="font-bold text-xs text-on-surface truncate">{t('vaultForm.category.identity')}</span>
            </div>
            <span className="font-mono text-xs font-bold text-on-surface bg-surface-high border border-outline-variant/15 px-2 py-0.5 rounded-md tabular-nums shrink-0">
              {identityCount ?? 0}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
