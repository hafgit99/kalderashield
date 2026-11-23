/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import type { VaultItem } from '../types';
import PasskeyDetail from './PasskeyDetail';

const passkeyItem: VaultItem = {
  id: 'passkey-1',
  title: 'GitHub API',
  username: 'public-key-id',
  url: '',
  passkeyService: 'GitHub',
  passkeyPrivateExponent: 'private-secret-value',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-11T12:00:00.000Z',
  category: 'passkey',
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('PasskeyDetail', () => {
  it('renders nothing for non-passkey items', () => {
    const { container } = render(
      <PasskeyDetail
        item={{ ...passkeyItem, category: 'login' }}
        copiedField={null}
        isPrivateExponentRevealed={false}
        onToggleReveal={vi.fn()}
        onCopyText={vi.fn()}
      />,
    );

    expect(container.textContent).toBe('');
  });

  it('renders passkey service and masked private secret', () => {
    render(
      <PasskeyDetail
        item={passkeyItem}
        copiedField={null}
        isPrivateExponentRevealed={false}
        onToggleReveal={vi.fn()}
        onCopyText={vi.fn()}
      />,
    );

    expect(screen.getByText(/H.*ZMET \/ KULLANIM ALANI/)).toBeTruthy();
    expect(screen.getByText('GitHub')).toBeTruthy();
    expect(screen.getByText('public-key-id')).toBeTruthy();
    expect(screen.queryByText('private-secret-value')).toBeNull();
  });

  it('reveals and copies passkey fields', () => {
    const onToggleReveal = vi.fn();
    const onCopyText = vi.fn();

    render(
      <PasskeyDetail
        item={passkeyItem}
        copiedField={null}
        isPrivateExponentRevealed={true}
        onToggleReveal={onToggleReveal}
        onCopyText={onCopyText}
      />,
    );

    expect(screen.getByText('private-secret-value')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button')[0]!);
    fireEvent.click(screen.getAllByRole('button')[1]!);
    fireEvent.click(screen.getAllByTitle('Kopyala')[1]!);

    expect(onCopyText).toHaveBeenCalledWith('public-key-id', 'passkeyPublicId');
    expect(onToggleReveal).toHaveBeenCalledTimes(1);
    expect(onCopyText).toHaveBeenCalledWith('private-secret-value', 'passkeyPrivateExponent');
  });

  it('renders copied states for public id and private exponent', () => {
    ['passkeyPublicId', 'passkeyPrivateExponent'].forEach((copiedField) => {
      const { container, unmount } = render(
        <PasskeyDetail
          item={passkeyItem}
          copiedField={copiedField}
          isPrivateExponentRevealed={copiedField === 'passkeyPrivateExponent'}
          onToggleReveal={vi.fn()}
          onCopyText={vi.fn()}
        />,
      );

      expect(container.querySelector('.text-brand-tertiary')).toBeTruthy();
      unmount();
    });
  });

  it('uses fallback labels and copies empty strings when passkey fields are missing', () => {
    const onCopyText = vi.fn();
    const fallbackItem: VaultItem = {
      ...passkeyItem,
      username: '',
      passkeyService: undefined,
      passkeyPrivateExponent: undefined,
    };

    render(
      <PasskeyDetail
        item={fallbackItem}
        copiedField={null}
        isPrivateExponentRevealed={true}
        onToggleReveal={vi.fn()}
        onCopyText={onCopyText}
      />,
    );

    expect(screen.getByText('Güvenli Anahtar')).toBeTruthy();
    expect(screen.getByText('boş')).toBeTruthy();
    expect(screen.getByText('(Değer Girilmedi)')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button')[0]!);
    fireEvent.click(screen.getAllByTitle('Kopyala')[1]!);

    expect(onCopyText).toHaveBeenCalledWith('', 'passkeyPublicId');
    expect(onCopyText).toHaveBeenCalledWith('', 'passkeyPrivateExponent');
  });

  it('renders passkey labels and controls in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <PasskeyDetail
          item={{
            ...passkeyItem,
            username: '',
            passkeyService: undefined,
            passkeyPrivateExponent: undefined,
          }}
          copiedField={null}
          isPrivateExponentRevealed={true}
          onToggleReveal={vi.fn()}
          onCopyText={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('SERVICE / USE CASE')).toBeTruthy();
    expect(screen.getByText('IDENTIFIER / PUBLIC ID')).toBeTruthy();
    expect(screen.getByText('SECRET KEY / TOKEN')).toBeTruthy();
    expect(screen.getByText('Secure Key')).toBeTruthy();
    expect(screen.getByText('empty')).toBeTruthy();
    expect(screen.getByText('(No Value Entered)')).toBeTruthy();
    expect(screen.getAllByTitle('Copy').length).toBeGreaterThan(0);
    expect(screen.getByTitle('Hide')).toBeTruthy();
  });

  it('renders dedicated WebAuthn metadata instead of manual secret placeholders for WebAuthn passkeys', () => {
    const onCopyText = vi.fn();
    const onToggleReveal = vi.fn();
    const webAuthnItem: VaultItem = {
      id: 'webauthn-1',
      title: 'Local Test',
      username: 'alice@localhost',
      url: 'https://localhost',
      category: 'passkey',
      createdAt: '2026-06-10T12:00:00.000Z',
      updatedAt: '2026-06-11T12:00:00.000Z',
      passkeyCredentialId: 'cred-abc-123',
      passkeyRpId: 'localhost',
      passkeyRpName: 'KalderaShield Local',
      passkeyUserName: 'alice@localhost',
      passkeyAlgorithm: 'ES256',
      passkeySignCount: 4,
      passkeyAttachment: 'platform',
      passkeyTransports: ['internal'],
      passkeyPublicKey: 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtestkey',
      passkeyPrivateKeyBundle: { iv: '00', tag: '00', ciphertext: 'AA' },
    };

    render(
      <PasskeyDetail
        item={webAuthnItem}
        copiedField={null}
        isPrivateExponentRevealed={false}
        onToggleReveal={onToggleReveal}
        onCopyText={onCopyText}
      />,
    );

    expect(screen.getByTestId('webauthn-passkey-detail')).toBeTruthy();
    expect(screen.getByTestId('passkey-rp-name-value').textContent).toBe('KalderaShield Local');
    expect(screen.getByTestId('passkey-rp-id-value').textContent).toBe('localhost');
    expect(screen.getByTestId('passkey-algorithm-value').textContent).toBe('ES256');
    expect(screen.getByTestId('passkey-credential-id-value').textContent).toBe('cred-abc-123');
    expect(screen.getByTestId('passkey-sign-count-value').textContent).toBe('4');
    expect(screen.getByTestId('passkey-attachment-value').textContent).toBe('Platform');
    expect(screen.queryByText('(Değer Girilmedi)')).toBeNull();
    expect(screen.queryByText('MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEtestkey')).toBeNull();

    const copyButtons = screen.getAllByTitle('Kopyala');
    fireEvent.click(copyButtons[1]!);
    expect(onCopyText).toHaveBeenCalledWith('cred-abc-123', 'passkeyCredentialId');
  });
});
