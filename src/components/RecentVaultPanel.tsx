import { Clock } from 'lucide-react';
import React from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import type { VaultItem } from '../types';
import RecentVaultItem from './RecentVaultItem';

interface RecentVaultPanelProps {
  items: VaultItem[];
  copiedField: string | null;
  onSelect: (item: VaultItem) => void;
  onCopyText: (text: string, field: string) => void;
  maxItems?: number;
}

function getItemTimestampMs(item: VaultItem): number {
  const raw = item.updatedAt || item.createdAt;
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export default function RecentVaultPanel({
  items,
  copiedField,
  onSelect,
  onCopyText,
  maxItems = 3,
}: RecentVaultPanelProps) {
  const { t } = useLanguage();
  const recentItems = React.useMemo(() => {
    return items
      .map((item, idx) => ({ item, idx, ts: getItemTimestampMs(item) }))
      .sort((a, b) => (b.ts !== a.ts ? b.ts - a.ts : b.idx - a.idx))
      .slice(0, maxItems)
      .map((entry) => entry.item);
  }, [items, maxItems]);

  return (
    <div className="surface-panel rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-3">
      <div>
        <div className="flex items-center justify-between border-b border-outline-variant/15 pb-2.5 mb-3">
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-primary" />
            <span>{t('dashboard.recent.title')}</span>
          </h3>
          <span className="text-[11px] text-on-surface-variant font-mono">{t('dashboard.recent.badge')}</span>
        </div>
        <div className={maxItems > 3 ? 'grid grid-cols-1 md:grid-cols-2 gap-2.5' : 'space-y-2.5'}>
          {items.length === 0 ? (
            <p className="text-xs text-on-surface-variant/60 italic py-4 text-center md:col-span-2">{t('dashboard.recent.empty')}</p>
          ) : (
            recentItems.map((item) => (
              <React.Fragment key={item.id}>
                <RecentVaultItem item={item} copiedField={copiedField} onSelect={onSelect} onCopyText={onCopyText} />
              </React.Fragment>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
