import { Lock } from 'lucide-react';

import { APP_NAME } from '../lib/branding';
import { useLanguage } from '../i18n/LanguageContext';

interface DashboardHeaderProps {
  profileName: string;
  onOpenProfile: () => void;
  onLock: () => void;
}

export default function DashboardHeader({ profileName, onOpenProfile, onLock }: DashboardHeaderProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/15 pb-3.5 sm:pb-4">
      <div className="space-y-0.5">
        <h2 className="font-display text-lg sm:text-xl font-bold text-on-surface flex flex-wrap items-center gap-x-2 gap-y-0.5 tracking-tight">
          <span>{t('dashboard.title')}</span>
          <span className="text-brand-primary">{APP_NAME}</span>
        </h2>
        <p className="hidden sm:block text-on-surface-variant text-xs">
          {t('dashboard.subtitle')}
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        <div className="text-right hidden sm:block">
          <p className="text-xs text-on-surface font-semibold leading-tight">{profileName}</p>
          <p className="text-[11px] text-on-surface-variant">{t('dashboard.autoLock')}</p>
        </div>
        <button
          type="button"
          data-testid="dashboard-lock-button"
          onClick={onLock}
          className="lg:hidden w-9 h-9 rounded-lg bg-brand-error/10 border border-brand-error/25 flex items-center justify-center text-brand-error hover:bg-brand-error/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-error/40 active:scale-95 transition-all cursor-pointer"
          title={t('nav.lockVault')}
          aria-label={t('nav.lockVault')}
        >
          <Lock className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onOpenProfile}
          className="w-9 h-9 rounded-lg bg-brand-primary/10 border border-brand-primary/25 flex items-center justify-center text-brand-primary text-sm font-bold font-display select-none cursor-pointer hover:bg-brand-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 active:scale-95 transition-all"
        >
          {profileName.charAt(0).toUpperCase()}
        </button>
      </div>
    </div>
  );
}
