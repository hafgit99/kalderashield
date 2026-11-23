/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../i18n/LanguageContext';
import type { PasskeyRecord } from '../lib/passkey';
import { ExtensionPasskeyModal } from './ExtensionPasskeyModal';
import type { ExtensionPasskeyRequest } from '../hooks/useExtensionPasskeyListener';

const RECORD_A: PasskeyRecord = {
  itemId: 'item-a',
  credentialId: 'cred-a',
  publicKey: 'pk-a',
  privateKeyBundle: { iv: '00', tag: '00', ciphertext: 'AA' },
  rpId: 'github.com',
  rpName: 'GitHub',
  userName: 'alice@github.com',
  signCount: 1,
  algorithm: 'ES256',
  createdAt: '2026-06-01T00:00:00.000Z',
  providerKind: 'software',
};

const RECORD_B: PasskeyRecord = {
  ...RECORD_A,
  itemId: 'item-b',
  credentialId: 'cred-b',
  userName: 'work@github.com',
};

afterEach(() => {
  cleanup();
});

describe('ExtensionPasskeyModal', () => {
  it('renders nothing when there is no pending request', () => {
    const { container } = render(
      <LanguageProvider>
        <ExtensionPasskeyModal
          request={null}
          matchingRecords={[]}
          onApproveCreate={vi.fn()}
          onApproveGet={vi.fn()}
          onFallbackToDevice={vi.fn()}
          onCancel={vi.fn()}
        />
      </LanguageProvider>,
    );
    expect(container.textContent).toBe('');
  });

  it('renders create request context and triggers approve, fallback, and cancel actions', () => {
    const onApproveCreate = vi.fn();
    const onFallbackToDevice = vi.fn();
    const onCancel = vi.fn();
    const req: ExtensionPasskeyRequest = {
      requestId: 'req-1',
      kind: 'create',
      origin: 'https://github.com',
      rpId: 'github.com',
      rpName: 'GitHub',
      userName: 'alice@github.com',
      challengeBase64Url: 'Y2hhbGxlbmdl',
    };

    render(
      <LanguageProvider>
        <ExtensionPasskeyModal
          request={req}
          matchingRecords={[]}
          onApproveCreate={onApproveCreate}
          onApproveGet={vi.fn()}
          onFallbackToDevice={onFallbackToDevice}
          onCancel={onCancel}
        />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('extension-passkey-rpid').textContent).toBe('github.com');
    expect(screen.getByTestId('extension-passkey-origin').textContent).toBe('https://github.com');
    expect(screen.getByTestId('extension-passkey-username').textContent).toBe('alice@github.com');

    fireEvent.click(screen.getByTestId('extension-passkey-approve-create'));
    fireEvent.click(screen.getByTestId('extension-passkey-fallback'));
    fireEvent.click(screen.getByTestId('extension-passkey-cancel'));

    expect(onApproveCreate).toHaveBeenCalledTimes(1);
    expect(onFallbackToDevice).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('allows selecting among multiple matching passkeys on get requests', () => {
    const onApproveGet = vi.fn();
    const req: ExtensionPasskeyRequest = {
      requestId: 'req-2',
      kind: 'get',
      origin: 'https://github.com',
      rpId: 'github.com',
      challengeBase64Url: 'Y2hhbGxlbmdl',
    };

    render(
      <LanguageProvider>
        <ExtensionPasskeyModal
          request={req}
          matchingRecords={[RECORD_A, RECORD_B]}
          onApproveCreate={vi.fn()}
          onApproveGet={onApproveGet}
          onFallbackToDevice={vi.fn()}
          onCancel={vi.fn()}
        />
      </LanguageProvider>,
    );

    const options = screen.getAllByTestId('extension-passkey-option');
    expect(options).toHaveLength(2);
    fireEvent.click(options[1]!);
    fireEvent.click(screen.getByTestId('extension-passkey-approve-get'));

    expect(onApproveGet).toHaveBeenCalledWith(RECORD_B);
  });
});
