import { useLanguage } from '../i18n/LanguageContext';
import { getLogoForPlatform } from '../lib/display';
import { getAvatarToneClass } from '../lib/formatters';
import type { VaultItem } from '../types';

interface RecentVaultItemProps {
  item: VaultItem;
  copiedField: string | null;
  onSelect: (item: VaultItem) => void;
  onCopyText: (text: string, field: string) => void;
}

export default function RecentVaultItem({ item, copiedField, onSelect, onCopyText }: RecentVaultItemProps) {
  const { t } = useLanguage();
  const logoUrl = getLogoForPlatform(item.title, item.url);
  const avatarTone = getAvatarToneClass(item.title || item.id);
  const usernameCopyField = `recent-user-${item.id}`;
  const passwordCopyField = `recent-pass-${item.id}`;

  return (
    <div className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-surface-low/80 border border-outline-variant/15 hover:border-brand-primary/25 transition-all hover:bg-surface-high/60 group">
      <button
        type="button"
        className="flex items-center gap-3 cursor-pointer min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded-lg"
        onClick={() => onSelect(item)}
      >
        <div
          className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 overflow-hidden ${
            logoUrl ? 'bg-surface-container border-outline-variant/15' : avatarTone
          }`}
        >
          {logoUrl ? (
            <img alt={item.title} className="w-5 h-5 object-contain" src={logoUrl} referrerPolicy="no-referrer" />
          ) : (
            <span className="font-display font-bold text-xs">
              {(item.title || '?').charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-xs text-on-surface group-hover:text-brand-primary transition-colors truncate">
            {item.title}
          </p>
          <p className="text-[11px] text-on-surface-variant font-mono truncate">{item.username}</p>
        </div>
      </button>
      <div className="flex items-center gap-1.5 shrink-0">
        {item.username && (
          <button
            type="button"
            onClick={() => onCopyText(item.username, usernameCopyField)}
            className="px-2 py-1 rounded-md bg-surface-container border border-outline-variant/20 text-[10px] font-medium text-on-surface-variant hover:text-brand-primary hover:border-brand-primary/30 transition-all font-mono whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
            title={t('vaultItem.copyUsername')}
          >
            {copiedField === usernameCopyField ? '✓' : t('vaultItem.usernameLabel')}
          </button>
        )}
        <button
          type="button"
          onClick={() => onCopyText(item.password || '', passwordCopyField)}
          className="px-2 py-1 rounded-md bg-surface-container border border-outline-variant/20 text-[10px] font-medium text-on-surface-variant hover:text-brand-primary hover:border-brand-primary/30 transition-all font-mono whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
          title={t('vaultItem.copyPassword')}
        >
          {copiedField === passwordCopyField ? '✓' : t('vaultItem.passwordLabel')}
        </button>
      </div>
    </div>
  );
}
