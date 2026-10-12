/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/i18nTypes';

function ProblemChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Simulated render explosion');
  }
  return <div>Healthy Child Content</div>;
}

/**
 * P3-5: these three strings used to be English literals in a twelve-locale app,
 * and this file asserted them in English -- which passed precisely because the
 * bug was there. `defaultLanguage` is 'tr', so the boundary now renders Turkish
 * unless a language is chosen, and the assertions below say which language they
 * are asserting rather than relying on whichever one happened to be stored.
 */
function renderWithLanguage(language: string | null, node: React.ReactNode) {
  if (language) window.localStorage.setItem(languageStorageKey, language);
  else window.localStorage.removeItem(languageStorageKey);
  return render(<LanguageProvider>{node}</LanguageProvider>);
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundary (P2-10, P3-5)', () => {
  it('renders children normally when no error occurs', () => {
    renderWithLanguage(null, (
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>
    ));

    expect(screen.getByText('Healthy Child Content')).toBeTruthy();
  });

  it('catches render error, invokes onLock, and renders the crash screen', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onLock = vi.fn();

    renderWithLanguage('en', (
      <ErrorBoundary onLock={onLock}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    ));

    // Should render the secure fallback UI
    expect(screen.getByTestId('unlocked-error-boundary-fallback')).toBeTruthy();
    expect(screen.getByText('Unexpected Application Error')).toBeTruthy();

    // onLock should have been called to safeguard decrypted memory
    expect(onLock).toHaveBeenCalled();

    // Clicking manual lock button should call onLock
    const initialCallCount = onLock.mock.calls.length;
    const lockBtn = screen.getByRole('button', { name: /Lock Vault Immediately/i });
    fireEvent.click(lockBtn);
    expect(onLock.mock.calls.length).toBeGreaterThan(initialCallCount);

    consoleError.mockRestore();
  });

  it('renders the crash screen in the reader\'s language, not English', () => {
    // The regression P3-5 exists to prevent. Before the fix this screen showed
    // the English literals in every locale.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithLanguage('tr', (
      <ErrorBoundary onLock={vi.fn()}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    ));

    expect(screen.getByText('Beklenmeyen Uygulama Hatası')).toBeTruthy();
    expect(screen.queryByText('Unexpected Application Error')).toBeNull();
    expect(
      screen.getByRole('button', { name: /Kasayı Hemen Kilitle/i }),
    ).toBeTruthy();

    consoleError.mockRestore();
  });

  it('still renders a usable screen if the language itself is unknown', () => {
    // A crash screen that renders a raw i18n key when the dictionary lookup
    // fails would be worse than an English one: the user is already in a bad
    // state and gets told nothing useful.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithLanguage('zz-not-a-language', (
      <ErrorBoundary onLock={vi.fn()}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    ));

    // readStoredLanguage rejects an unsupported code, so this is the default.
    expect(screen.getByText('Beklenmeyen Uygulama Hatası')).toBeTruthy();

    consoleError.mockRestore();
  });
});