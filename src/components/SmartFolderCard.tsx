/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Archive,
  Briefcase,
  CreditCard,
  FileText,
  Folder as FolderIcon,
  Globe,
  Home,
  Inbox,
  KeyRound,
  Lock,
  Shield,
  Star,
  Tag as TagIcon,
  User,
  X,
} from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations';
import { getPalette } from '../lib/tags';
import type { FolderIconKey, SmartFolder } from '../types';

const ICONS: Record<FolderIconKey, typeof FolderIcon> = {
  folder: FolderIcon,
  inbox: Inbox,
  star: Star,
  briefcase: Briefcase,
  home: Home,
  'credit-card': CreditCard,
  'key-round': KeyRound,
  shield: Shield,
  lock: Lock,
  tag: TagIcon,
  user: User,
  globe: Globe,
  archive: Archive,
  'file-text': FileText,
};

interface SmartFolderCardProps {
  folder: SmartFolder;
  count: number;
  isActive: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onRename?: () => void;
  /** Internal: do not pass directly — the key for the React list. */
  key?: string;
}

/**
 * Compact card for a smart folder. Renders the icon, name, a
 * one-line description, the live match count, and a delete button
 * for user-defined folders. Built-in folders are read-only — the
 * delete button is hidden.
 */
export default function SmartFolderCard({
  folder,
  count,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: SmartFolderCardProps) {
  const { t } = useLanguage();
  const Icon = ICONS[folder.icon] ?? FolderIcon;
  const palette = getPalette(folder.color);

  const label = folder.builtIn ? t(`smartFolders.${folder.id}.name` as TranslationKey) : folder.name;
  const description = folder.description
    ? (folder.builtIn ? t(`smartFolders.${folder.id}.desc` as TranslationKey) : folder.description)
    : undefined;

  return (
    <button
      type="button"
      onClick={onSelect}
      title={description}
      data-testid="smart-folder-card"
      data-smart-folder-id={folder.id}
      className={`group relative w-full text-left rounded-lg border px-2.5 py-2 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/40 ${
        isActive
          ? `${palette.background} ${palette.border} ring-1 ring-brand-primary/35`
          : 'border-transparent bg-transparent hover:border-outline-variant/20 hover:bg-surface-high/60'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`w-6 h-6 rounded-md inline-flex items-center justify-center shrink-0 ${palette.inline}`}>
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        </span>
        <span className="flex-1 min-w-0 text-xs font-semibold text-on-surface truncate">
          {label}
        </span>
        <span
          className="text-[10px] font-mono font-bold text-on-surface-variant bg-surface-low border border-outline-variant/15 rounded-full px-1.5 py-0.5 tabular-nums shrink-0 group-hover:opacity-100"
          data-testid="smart-folder-count"
        >
          {count}
        </span>
      </div>
      {(onRename || (onDelete && !folder.builtIn)) && (
        <div className="invisible group-hover:visible absolute top-1.5 right-8 flex items-center gap-0.5 bg-surface-container/95 rounded px-0.5">
          {onRename && (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onRename();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onRename();
                }
              }}
              className="inline-flex items-center justify-center w-5 h-5 rounded-md text-on-surface-variant hover:text-brand-primary cursor-pointer focus:outline-none text-[10px] font-mono"
              title={t('folders.rename')}
              aria-label={t('folders.rename')}
            >
              ✎
            </span>
          )}
          {onDelete && !folder.builtIn && (
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  onDelete();
                }
              }}
              className="inline-flex items-center justify-center w-5 h-5 rounded-md text-on-surface-variant hover:text-red-400 cursor-pointer focus:outline-none"
              title={t('smartFolders.delete')}
              aria-label={t('smartFolders.delete')}
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </span>
          )}
        </div>
      )}
    </button>
  );
}
