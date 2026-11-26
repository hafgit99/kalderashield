import { Clock, HeartHandshake, KeyRound, Lock, Settings, ShieldCheck, Trash2 } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { APP_NAME } from '../lib/branding';
import type { ActiveTab } from '../types';
// Same raster as the lock screen logo. It used to import src-tauri/icons/icon.png
// directly, which meant this surface tracked the desktop bundle while the lock
// screen tracked assets/ -- two files for one mark, so they drifted apart.
import KalderaShieldLogo from '../../assets/KalderaShield-app-icon.png';

interface SidebarNavigationProps {
  activeTab: ActiveTab;
  isOpen: boolean;
  trashCount: number;
  onTabChange: (tab: ActiveTab) => void;
  onLock: () => void;
}

function getNavButtonClass(activeTab: ActiveTab, tab: ActiveTab): string {
  return `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm font-semibold transition-all focus:outline-none cursor-pointer ${
    activeTab === tab
      ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20'
      : 'text-on-surface-variant border-transparent hover:bg-surface-high/80 hover:text-on-surface'
  }`;
}

export default function SidebarNavigation({
  activeTab,
  isOpen,
  trashCount,
  onTabChange,
  onLock,
}: SidebarNavigationProps) {
  const { t } = useLanguage();

  return (
    <aside
      className={`fixed left-0 top-0 h-full w-[240px] bg-surface-lowest border-r border-outline-variant/15 flex flex-col px-3.5 pb-4 safe-sidebar safe-bottom z-50 transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      <div className="mb-5 sm:mb-6 px-1.5 flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shadow-inner overflow-hidden shrink-0">
          <img src={KalderaShieldLogo} alt="KalderaShield Logo" className="w-7 h-7 object-contain" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-[18px] font-bold text-on-surface leading-tight tracking-tight truncate">{APP_NAME}</h1>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-semibold truncate">{t('nav.localFirst')}</p>
        </div>
      </div>

      <nav className="flex-1 min-h-0 space-y-1 overflow-y-auto scrollbar-hide pr-0.5">
        <button
          data-testid="nav-vault-button"
          onClick={() => onTabChange('vault')}
          className={getNavButtonClass(activeTab, 'vault')}
        >
          <Lock className="w-4 h-4 shrink-0" />
          <span>{t('nav.vault')}</span>
        </button>

        <button
          data-testid="nav-audit-button"
          onClick={() => onTabChange('audit')}
          className={getNavButtonClass(activeTab, 'audit')}
        >
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{t('nav.audit')}</span>
        </button>

        <button
          data-testid="nav-generator-button"
          onClick={() => onTabChange('generator')}
          className={getNavButtonClass(activeTab, 'generator')}
        >
          <KeyRound className="w-4 h-4 shrink-0" />
          <span>{t('nav.generator')}</span>
        </button>

        <button
          data-testid="nav-settings-button"
          onClick={() => onTabChange('settings')}
          className={getNavButtonClass(activeTab, 'settings')}
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span>{t('nav.settings')}</span>
        </button>

        <button
          data-testid="nav-trash-button"
          onClick={() => onTabChange('trash')}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm font-semibold transition-all focus:outline-none cursor-pointer ${
            activeTab === 'trash'
              ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20'
              : 'text-on-surface-variant border-transparent hover:bg-surface-high/80 hover:text-on-surface'
          }`}
        >
          <div className="flex items-center gap-3">
            <Trash2 className="w-4 h-4 shrink-0" />
            <span>{t('nav.trash')}</span>
          </div>
          {trashCount > 0 && (
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-brand-error/15 text-brand-error font-mono font-bold tabular-nums">
              {trashCount}
            </span>
          )}
        </button>
      </nav>

      <div className="mt-auto shrink-0 pt-3 border-t border-outline-variant/15 space-y-2">
        <button
          data-testid="nav-donate-button"
          onClick={() => onTabChange('donate')}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-all focus:outline-none cursor-pointer ${
            activeTab === 'donate'
              ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20'
              : 'text-on-surface-variant/85 border-transparent hover:bg-surface-high/70 hover:text-on-surface'
          }`}
        >
          <HeartHandshake className="w-3.5 h-3.5 shrink-0" />
          <span>{t('nav.donate')}</span>
        </button>

        <div className="flex items-center justify-between px-3 py-2 text-on-surface-variant text-xs surface-card rounded-lg">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-brand-primary shrink-0" />
            <span className="font-medium">{t('nav.systemHealth')}</span>
          </div>
          <div className="w-2 h-2 rounded-full bg-brand-primary security-pulse" />
        </div>

        <button
          data-testid="lock-vault-button"
          onClick={onLock}
          className="w-full flex items-center justify-between bg-surface-low border border-outline-variant/20 text-on-surface px-3 py-2.5 rounded-lg font-bold text-xs hover:bg-surface-high hover:border-outline-variant/35 transition-all cursor-pointer mb-[max(env(safe-area-inset-bottom),0px)]"
        >
          <span className="flex items-center gap-2">
            <Lock className="w-4 h-4" />
            <span>{t('nav.lockVault')}</span>
          </span>
          <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-medium text-on-surface-variant bg-surface-lowest border border-outline-variant/25 rounded">
            Ctrl L
          </kbd>
        </button>
      </div>
    </aside>
  );
}
