import { Plus, Shield, Sparkles } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';

interface DashboardQuickActionsProps {
  onNewItem: () => void;
  onOpenAudit: () => void;
  onOpenGenerator: () => void;
}

export default function DashboardQuickActions({ onNewItem, onOpenAudit, onOpenGenerator }: DashboardQuickActionsProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-2">
      <h3 className="font-display text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">{t('dashboard.quick.title')}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={onNewItem}
          className="surface-card surface-card-hover p-3 sm:p-3.5 rounded-xl flex items-center gap-3 text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
        >
          <div className="icon-tile bg-brand-primary/10 text-brand-primary group-hover:scale-105 transition-transform shrink-0">
            <Plus className="w-4.5 h-4.5" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <h4 className="font-bold text-xs text-on-surface truncate">{t('dashboard.quick.newItem.title')}</h4>
            <p className="hidden sm:block text-[11px] text-on-surface-variant truncate">{t('dashboard.quick.newItem.description')}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenAudit}
          className="surface-card surface-card-hover p-3 sm:p-3.5 rounded-xl flex items-center gap-3 text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary/40"
        >
          <div className="icon-tile bg-brand-secondary/15 text-brand-secondary group-hover:scale-105 transition-transform shrink-0">
            <Shield className="w-4.5 h-4.5" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <h4 className="font-bold text-xs text-on-surface truncate">{t('dashboard.quick.audit.title')}</h4>
            <p className="hidden sm:block text-[11px] text-on-surface-variant truncate">{t('dashboard.quick.audit.description')}</p>
          </div>
        </button>

        <button
          type="button"
          onClick={onOpenGenerator}
          className="surface-card surface-card-hover p-3 sm:p-3.5 rounded-xl flex items-center gap-3 text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-tertiary/40"
        >
          <div className="icon-tile bg-brand-tertiary/15 text-brand-tertiary group-hover:scale-105 transition-transform shrink-0">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <h4 className="font-bold text-xs text-on-surface font-display truncate">{t('dashboard.quick.generator.title')}</h4>
            <p className="hidden sm:block text-[11px] text-on-surface-variant truncate">{t('dashboard.quick.generator.description')}</p>
          </div>
        </button>
      </div>
    </div>
  );
}
