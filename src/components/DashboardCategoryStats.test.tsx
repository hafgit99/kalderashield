/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import DashboardCategoryStats from './DashboardCategoryStats';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('DashboardCategoryStats', () => {
  it('renders category labels and counts', () => {
    render(<DashboardCategoryStats loginCount={7} cardCount={2} secureNoteCount={4} />);

    expect(screen.getByText('Hesap Parolaları')).toBeTruthy();
    expect(screen.getByText('Ödeme Kartları')).toBeTruthy();
    expect(screen.getByText('Güvenli Notlar')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('renders category labels in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <DashboardCategoryStats loginCount={7} cardCount={2} secureNoteCount={4} />
      </LanguageProvider>,
    );

    expect(screen.getByText('Account Passwords')).toBeTruthy();
    expect(screen.getByText('Payment Cards')).toBeTruthy();
    expect(screen.getByText('Secure Notes')).toBeTruthy();
  });

  it('renders passkey/identity counts and forwards category selection clicks', () => {
    const onSelectCategory = vi.fn();

    render(
      <DashboardCategoryStats
        loginCount={7}
        cardCount={2}
        secureNoteCount={4}
        passkeyCount={3}
        identityCount={1}
        onSelectCategory={onSelectCategory}
      />,
    );

    fireEvent.click(screen.getByTestId('dashboard-category-login'));
    fireEvent.click(screen.getByTestId('dashboard-category-passkey'));
    fireEvent.click(screen.getByTestId('dashboard-category-identity'));

    expect(onSelectCategory).toHaveBeenNthCalledWith(1, 'login');
    expect(onSelectCategory).toHaveBeenNthCalledWith(2, 'passkey');
    expect(onSelectCategory).toHaveBeenNthCalledWith(3, 'identity');
  });
});
