/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  CreditCard,
  FileText,
  KeyRound,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Sliders,
  User,
  UserCheck,
  X,
} from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { generateTOTP } from '../lib/otp';
import type { VaultItem } from '../types';
import { Modal } from './ui/Modal';

interface CommandPaletteProps {
  isOpen: boolean;
  items: VaultItem[];
  copiedField: string | null;
  onClose: () => void;
  onSelectItem: (item: VaultItem) => void;
  onCopyText: (text: string, field: string) => void;
  onNewItem: () => void;
  onOpenAudit: () => void;
  onOpenGenerator: () => void;
  onFocusVaultSearch: () => void;
  onLock: () => void;
}

interface PaletteAction {
  id: string;
  label: string;
  shortcut?: string;
  icon: 'new' | 'audit' | 'generator' | 'search' | 'lock';
  run: () => void;
}

function scoreItemMatch(item: VaultItem, normalizedQuery: string): number {
  if (!normalizedQuery) {
    return item.favorite ? 2 : 1;
  }
  const title = (item.title || '').toLowerCase();
  const username = (item.username || '').toLowerCase();
  const url = (item.url || '').toLowerCase();
  const extraUrls = (item.additionalUrls ?? []).join(' ').toLowerCase();
  const tags = (item.tags ?? []).join(' ').toLowerCase();

  let score = 0;
  if (title === normalizedQuery) score += 100;
  else if (title.startsWith(normalizedQuery)) score += 70;
  else if (title.includes(normalizedQuery)) score += 45;

  if (username.includes(normalizedQuery)) score += 35;
  if (url.includes(normalizedQuery) || extraUrls.includes(normalizedQuery)) score += 30;
  if (tags.includes(normalizedQuery)) score += 20;

  if (score === 0) {
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const haystack = `${title} ${username} ${url} ${extraUrls} ${tags}`;
    if (tokens.length > 1 && tokens.every((tok) => haystack.includes(tok))) {
      score = 25;
    }
  }

  if (score > 0 && item.favorite) {
    score += 5;
  }
  return score;
}

function renderCategoryIcon(category: VaultItem['category']) {
  switch (category) {
    case 'card':
      return <CreditCard className="w-4 h-4 text-brand-secondary shrink-0" />;
    case 'identity':
      return <UserCheck className="w-4 h-4 text-brand-tertiary shrink-0" />;
    case 'passkey':
      return <KeyRound className="w-4 h-4 text-brand-primary shrink-0" />;
    case 'secure_note':
      return <FileText className="w-4 h-4 text-on-surface-variant shrink-0" />;
    case 'login':
    default:
      return <KeyRound className="w-4 h-4 text-brand-primary shrink-0" />;
  }
}

export default function CommandPalette({
  isOpen,
  items,
  copiedField,
  onClose,
  onSelectItem,
  onCopyText,
  onNewItem,
  onOpenAudit,
  onOpenGenerator,
  onFocusVaultSearch,
  onLock,
}: CommandPaletteProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setQuery('');
    setActiveIndex(0);
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  const normalizedQuery = query.trim().toLowerCase();

  const matchedItems = useMemo(() => {
    return items
      .filter((item) => !item.deleted)
      .map((item) => ({ item, score: scoreItemMatch(item, normalizedQuery) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.item.updatedAt || b.item.createdAt || '').localeCompare(
          a.item.updatedAt || a.item.createdAt || '',
        );
      })
      .slice(0, 8)
      .map((entry) => entry.item);
  }, [items, normalizedQuery]);

  const actions = useMemo<PaletteAction[]>(() => {
    const allActions: PaletteAction[] = [
      {
        id: 'action-new-item',
        label: t('commandPalette.action.newItem'),
        shortcut: 'Ctrl+N',
        icon: 'new',
        run: () => {
          onClose();
          onNewItem();
        },
      },
      {
        id: 'action-audit',
        label: t('commandPalette.action.audit'),
        icon: 'audit',
        run: () => {
          onClose();
          onOpenAudit();
        },
      },
      {
        id: 'action-generator',
        label: t('commandPalette.action.generator'),
        icon: 'generator',
        run: () => {
          onClose();
          onOpenGenerator();
        },
      },
      {
        id: 'action-vault-search',
        label: t('commandPalette.action.focusSearch'),
        icon: 'search',
        run: () => {
          onClose();
          onFocusVaultSearch();
        },
      },
      {
        id: 'action-lock',
        label: t('commandPalette.action.lock'),
        shortcut: 'Ctrl+L',
        icon: 'lock',
        run: () => {
          onClose();
          onLock();
        },
      },
    ];

    if (!normalizedQuery) return allActions;
    return allActions.filter((action) => action.label.toLowerCase().includes(normalizedQuery));
  }, [t, normalizedQuery, onClose, onNewItem, onOpenAudit, onOpenGenerator, onFocusVaultSearch, onLock]);

  const totalEntries = matchedItems.length + actions.length;
  const effectiveActiveIndex = activeIndex < totalEntries ? activeIndex : 0;

  if (!isOpen) return null;

  const handleCopyTotp = async (item: VaultItem) => {
    if (!item.totpSecret) return;
    try {
      const code = await generateTOTP(item.totpSecret);
      onCopyText(code.replace(/\s+/g, ''), `palette_totp_${item.id}`);
    } catch {
      // Ignore invalid TOTP secrets in quick palette
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (totalEntries > 0) {
        setActiveIndex((prev) => (prev + 1) % totalEntries);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (totalEntries > 0) {
        setActiveIndex((prev) => (prev - 1 + totalEntries) % totalEntries);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (effectiveActiveIndex < matchedItems.length) {
        const chosen = matchedItems[effectiveActiveIndex];
        if (chosen) {
          onSelectItem(chosen);
          handleClose();
        }
      } else {
        const chosenAction = actions[effectiveActiveIndex - matchedItems.length];
        chosenAction?.run();
      }
    }
  };

  const renderActionIcon = (kind: PaletteAction['icon']) => {
    switch (kind) {
      case 'new':
        return <Plus className="w-4 h-4 text-brand-primary shrink-0" />;
      case 'audit':
        return <ShieldCheck className="w-4 h-4 text-brand-tertiary shrink-0" />;
      case 'generator':
        return <Sliders className="w-4 h-4 text-brand-secondary shrink-0" />;
      case 'search':
        return <Search className="w-4 h-4 text-on-surface-variant shrink-0" />;
      case 'lock':
        return <Lock className="w-4 h-4 text-brand-error shrink-0" />;
    }
  };

  return (
    <Modal open={isOpen} onClose={handleClose} zIndex={120} className="items-start pt-16 sm:pt-24">
      <div
        data-testid="command-palette-dialog"
        className="w-full max-w-xl bg-surface-container border border-outline-variant/30 rounded-2xl overflow-hidden custom-shadow flex flex-col max-h-[75dvh]"
      >
        {/* Search Input Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-outline-variant/15 bg-surface-lowest/70">
          <Search className="w-4.5 h-4.5 text-brand-primary shrink-0" />
          <input
            ref={inputRef}
            data-testid="command-palette-input"
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('commandPalette.placeholder')}
            aria-label={t('commandPalette.placeholder')}
            className="flex-1 bg-transparent text-sm text-on-surface placeholder-on-surface-variant/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-high/60 transition-colors cursor-pointer"
            title={t('vaultForm.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="overflow-y-auto p-2 space-y-3">
          {matchedItems.length > 0 && (
            <div className="space-y-1">
              <div className="px-2.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                {t('commandPalette.section.items')}
              </div>
              {matchedItems.map((item, idx) => {
                const isSelected = effectiveActiveIndex === idx;
                const userField = `palette_user_${item.id}`;
                const passField = `palette_pass_${item.id}`;
                const totpField = `palette_totp_${item.id}`;
                return (
                  <div
                    key={item.id}
                    data-testid={`command-palette-item-${item.id}`}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => {
                      onSelectItem(item);
                      handleClose();
                    }}
                    className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-brand-primary/12 border border-brand-primary/30'
                        : 'border border-transparent hover:bg-surface-high/50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
                      {renderCategoryIcon(item.category)}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-on-surface truncate">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-on-surface-variant truncate">
                          {item.username || item.url || item.category}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {item.username && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCopyText(item.username, userField);
                          }}
                          title={t('vaultItem.copyUsername')}
                          className="p-1.5 rounded-lg bg-surface-low hover:bg-surface-high border border-outline-variant/15 text-on-surface-variant hover:text-brand-primary transition-colors cursor-pointer"
                        >
                          {copiedField === userField ? (
                            <Check className="w-3.5 h-3.5 text-brand-tertiary" />
                          ) : (
                            <User className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                      {item.password && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onCopyText(item.password || '', passField);
                          }}
                          title={t('vaultItem.copyPassword')}
                          className="p-1.5 rounded-lg bg-surface-low hover:bg-surface-high border border-outline-variant/15 text-on-surface-variant hover:text-brand-primary transition-colors cursor-pointer"
                        >
                          {copiedField === passField ? (
                            <Check className="w-3.5 h-3.5 text-brand-tertiary" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                      {item.totpSecret && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCopyTotp(item);
                          }}
                          title={t('loginDetail.copyTotp')}
                          className="px-2 py-1 rounded-lg bg-surface-low hover:bg-surface-high border border-outline-variant/15 text-[10px] font-mono font-bold text-brand-primary transition-colors cursor-pointer"
                        >
                          {copiedField === totpField ? '✓' : '2FA'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {actions.length > 0 && (
            <div className="space-y-1">
              <div className="px-2.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                {t('commandPalette.section.actions')}
              </div>
              {actions.map((action, idx) => {
                const entryIdx = matchedItems.length + idx;
                const isSelected = effectiveActiveIndex === entryIdx;
                return (
                  <button
                    key={action.id}
                    type="button"
                    data-testid={action.id}
                    onMouseEnter={() => setActiveIndex(entryIdx)}
                    onClick={action.run}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-brand-primary/12 border border-brand-primary/30'
                        : 'border border-transparent hover:bg-surface-high/50'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 text-xs font-semibold text-on-surface">
                      {renderActionIcon(action.icon)}
                      <span>{action.label}</span>
                    </span>
                    {action.shortcut && (
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-on-surface-variant bg-surface-lowest border border-outline-variant/25 rounded">
                        {action.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {totalEntries === 0 && (
            <div className="py-8 text-center text-xs text-on-surface-variant">
              {t('commandPalette.empty')}
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2 border-t border-outline-variant/15 bg-surface-lowest/50 flex items-center justify-between text-[10px] text-on-surface-variant font-mono">
          <span>↑↓ {t('commandPalette.hint.navigate')}</span>
          <span>Enter {t('commandPalette.hint.select')}</span>
          <span>Esc {t('commandPalette.hint.close')}</span>
        </div>
      </div>
    </Modal>
  );
}
