/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VaultItem } from '../types';
import VaultItemExtrasCard from './VaultItemExtrasCard';

const baseItem: VaultItem = {
  id: 'extras-1',
  title: 'Enterprise Account',
  username: 'alice@example.com',
  password: 'StrongPassword!1',
  url: 'https://example.com',
  category: 'login',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VaultItemExtrasCard', () => {
  it('renders nothing when item has no additionalUrls, customFields, or recovery codes', () => {
    const { container } = render(
      <VaultItemExtrasCard item={baseItem} copiedField={null} onCopyText={vi.fn()} />,
    );
    expect(container.textContent).toBe('');
  });

  it('renders additional URLs, custom fields with hidden reveal toggle, and 2FA recovery codes', () => {
    const onCopyText = vi.fn();
    const itemWithExtras: VaultItem = {
      ...baseItem,
      additionalUrls: ['https://sso.example.com', 'androidapp://com.example.app'],
      customFields: [
        { id: 'cf-1', label: 'Tenant ID', value: 'TENANT-42', type: 'text' },
        { id: 'cf-2', label: 'Support PIN', value: '8842', type: 'hidden' },
        { id: 'cf-3', label: '', value: 'fallback-val', type: 'url' },
      ],
      totpRecoveryCodes: ['REC-1111-2222', 'REC-3333-4444'],
    };

    render(
      <VaultItemExtrasCard
        item={itemWithExtras}
        copiedField="additional_url_0"
        onCopyText={onCopyText}
      />,
    );

    expect(screen.getByTestId('vault-item-additional-urls-card')).toBeTruthy();
    expect(screen.getByText('https://sso.example.com')).toBeTruthy();
    expect(screen.getByText('androidapp://com.example.app')).toBeTruthy();

    expect(screen.getByTestId('vault-item-custom-fields-card')).toBeTruthy();
    expect(screen.getByText('TENANT-42')).toBeTruthy();
    expect(screen.getByText('••••••••••••')).toBeTruthy();
    expect(screen.queryByText('8842')).toBeNull();

    // Reveal hidden custom field
    const showButtons = screen.getAllByTitle('Göster');
    fireEvent.click(showButtons[0]!);
    expect(screen.getByText('8842')).toBeTruthy();

    // Reveal recovery codes and copy all + single
    expect(screen.getByTestId('vault-item-recovery-codes-card')).toBeTruthy();
    expect(screen.queryByText('REC-1111-2222')).toBeNull();
    fireEvent.click(screen.getByText('Göster'));
    expect(screen.getByText('REC-1111-2222')).toBeTruthy();
    expect(screen.getByText('REC-3333-4444')).toBeTruthy();

    // Click copy buttons
    const copyButtons = screen.getAllByTitle('Kopyala');
    fireEvent.click(copyButtons[0]!);
    expect(onCopyText).toHaveBeenCalledWith('https://sso.example.com', 'additional_url_0');

    fireEvent.click(copyButtons[2]!);
    expect(onCopyText).toHaveBeenCalledWith('TENANT-42', 'custom_field_cf-1');

    fireEvent.click(screen.getByText('Kopyala'));
    expect(onCopyText).toHaveBeenCalledWith('REC-1111-2222\nREC-3333-4444', 'totp_recovery_all');
  });
});
