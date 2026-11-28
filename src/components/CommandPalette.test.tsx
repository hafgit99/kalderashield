/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VaultItem } from '../types';
import CommandPalette from './CommandPalette';

const sampleItems: VaultItem[] = [
  {
    id: 'item-github',
    title: 'GitHub Enterprise',
    username: 'octocat@example.com',
    password: 'GhPassword!123',
    url: 'https://github.com',
    additionalUrls: ['https://gist.github.com'],
    totpSecret: 'JBSWY3DPEHPK3PXP',
    category: 'login',
    favorite: true,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-10T00:00:00.000Z',
  },
  {
    id: 'item-aws',
    title: 'AWS Console',
    username: 'admin@corp.test',
    password: 'AwsPassword!456',
    url: 'https://console.aws.amazon.com',
    category: 'login',
    favorite: false,
    createdAt: '2026-06-02T00:00:00.000Z',
    updatedAt: '2026-06-09T00:00:00.000Z',
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    render(
      <CommandPalette
        isOpen={false}
        items={sampleItems}
        copiedField={null}
        onClose={vi.fn()}
        onSelectItem={vi.fn()}
        onCopyText={vi.fn()}
        onNewItem={vi.fn()}
        onOpenAudit={vi.fn()}
        onOpenGenerator={vi.fn()}
        onFocusVaultSearch={vi.fn()}
        onLock={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('command-palette-dialog')).toBeNull();
  });

  it('filters items by title/additionalUrls and selects via Enter', () => {
    const onSelectItem = vi.fn();
    const onClose = vi.fn();

    render(
      <CommandPalette
        isOpen={true}
        items={sampleItems}
        copiedField={null}
        onClose={onClose}
        onSelectItem={onSelectItem}
        onCopyText={vi.fn()}
        onNewItem={vi.fn()}
        onOpenAudit={vi.fn()}
        onOpenGenerator={vi.fn()}
        onFocusVaultSearch={vi.fn()}
        onLock={vi.fn()}
      />,
    );

    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'gist.github' } });

    expect(screen.getByTestId('command-palette-item-item-github')).toBeTruthy();
    expect(screen.queryByTestId('command-palette-item-item-aws')).toBeNull();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelectItem).toHaveBeenCalledWith(sampleItems[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('triggers quick actions and inline copy without closing prematurely', () => {
    const onCopyText = vi.fn();
    const onOpenAudit = vi.fn();
    const onClose = vi.fn();

    render(
      <CommandPalette
        isOpen={true}
        items={sampleItems}
        copiedField={null}
        onClose={onClose}
        onSelectItem={vi.fn()}
        onCopyText={onCopyText}
        onNewItem={vi.fn()}
        onOpenAudit={onOpenAudit}
        onOpenGenerator={vi.fn()}
        onFocusVaultSearch={vi.fn()}
        onLock={vi.fn()}
      />,
    );

    const copyPasswordButtons = screen.getAllByTitle('Şifreyi Kopyala');
    fireEvent.click(copyPasswordButtons[0]!);
    expect(onCopyText).toHaveBeenCalledWith('GhPassword!123', 'palette_pass_item-github');
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('action-audit'));
    expect(onOpenAudit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports keyboard ArrowDown/ArrowUp navigation, action execution, username copy, and empty state', async () => {
    const onCopyText = vi.fn();
    const onNewItem = vi.fn();
    const onOpenGenerator = vi.fn();
    const onFocusVaultSearch = vi.fn();
    const onLock = vi.fn();
    const onClose = vi.fn();

    render(
      <CommandPalette
        isOpen={true}
        items={[
          ...sampleItems,
          {
            id: 'item-card',
            title: 'Corp Card',
            username: 'Ada',
            url: '',
            category: 'card',
            createdAt: '2026-06-03T00:00:00.000Z',
            updatedAt: '2026-06-03T00:00:00.000Z',
          },
          {
            id: 'item-id',
            title: 'Passport',
            username: 'P123',
            url: '',
            category: 'identity',
            createdAt: '2026-06-03T00:00:00.000Z',
            updatedAt: '2026-06-03T00:00:00.000Z',
          },
          {
            id: 'item-note',
            title: 'SSH Note',
            username: '',
            url: '',
            category: 'secure_note',
            createdAt: '2026-06-03T00:00:00.000Z',
            updatedAt: '2026-06-03T00:00:00.000Z',
          },
        ]}
        copiedField={null}
        onClose={onClose}
        onSelectItem={vi.fn()}
        onCopyText={onCopyText}
        onNewItem={onNewItem}
        onOpenAudit={vi.fn()}
        onOpenGenerator={onOpenGenerator}
        onFocusVaultSearch={onFocusVaultSearch}
        onLock={onLock}
      />,
    );

    const input = screen.getByTestId('command-palette-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });

    const copyUserBtns = screen.getAllByTitle('Kullanıcı Adını Kopyala');
    fireEvent.click(copyUserBtns[0]!);
    expect(onCopyText).toHaveBeenCalledWith('octocat@example.com', 'palette_user_item-github');

    // Quick actions
    fireEvent.click(screen.getByTestId('action-new-item'));
    expect(onNewItem).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('action-generator'));
    expect(onOpenGenerator).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('action-vault-search'));
    expect(onFocusVaultSearch).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('action-lock'));
    expect(onLock).toHaveBeenCalledTimes(1);

    // Empty state
    fireEvent.change(input, { target: { value: 'zzzz-no-match-999' } });
    expect(screen.getByText('Eşleşen kasa öğesi veya komut bulunamadı.')).toBeTruthy();
  });
});
