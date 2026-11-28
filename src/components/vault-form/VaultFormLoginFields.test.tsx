/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VaultFormGeneralFields } from './VaultFormGeneralFields';
import { VaultFormLoginFields } from './VaultFormLoginFields';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VaultFormGeneralFields & VaultFormLoginFields extras', () => {
  it('adds, edits, and removes additional URLs', () => {
    const onAdditionalUrlsChange = vi.fn();
    const { rerender } = render(
      <VaultFormGeneralFields
        title="Example"
        url="https://example.com"
        onTitleChange={vi.fn()}
        onUrlChange={vi.fn()}
        additionalUrls={[]}
        onAdditionalUrlsChange={onAdditionalUrlsChange}
      />,
    );

    fireEvent.click(screen.getByTestId('vault-item-add-url-button'));
    expect(onAdditionalUrlsChange).toHaveBeenCalledWith(['']);

    rerender(
      <VaultFormGeneralFields
        title="Example"
        url="https://example.com"
        onTitleChange={vi.fn()}
        onUrlChange={vi.fn()}
        additionalUrls={['https://a.example.com']}
        onAdditionalUrlsChange={onAdditionalUrlsChange}
      />,
    );

    fireEvent.change(screen.getByTestId('vault-item-additional-url-input-0'), {
      target: { value: 'androidapp://com.example.app' },
    });
    expect(onAdditionalUrlsChange).toHaveBeenLastCalledWith(['androidapp://com.example.app']);

    fireEvent.click(screen.getByTitle('Kaldır'));
    expect(onAdditionalUrlsChange).toHaveBeenLastCalledWith([]);
  });

  it('handles QR scan fallback when BarcodeDetector is unavailable and edits 2FA recovery codes', () => {
    const onTotpSecretChange = vi.fn();
    const onTotpRecoveryCodesChange = vi.fn();

    render(
      <VaultFormLoginFields
        username="user@example.com"
        onUsernameChange={vi.fn()}
        password="SecretPassword!1"
        onPasswordChange={vi.fn()}
        isPasswordVisible={false}
        onTogglePasswordVisibility={vi.fn()}
        onAutoGeneratePassword={vi.fn()}
        totpSecret=""
        onTotpSecretChange={onTotpSecretChange}
        totpRecoveryCodes={[]}
        onTotpRecoveryCodesChange={onTotpRecoveryCodesChange}
      />,
    );

    fireEvent.click(screen.getByTestId('totp-qr-scan-button'));
    expect(screen.getByText(/QR taramayı desteklemiyor/)).toBeTruthy();

    fireEvent.click(screen.getByTestId('totp-recovery-codes-toggle'));
    fireEvent.change(screen.getByTestId('totp-recovery-codes-textarea'), {
      target: { value: 'CODE-1\nCODE-2' },
    });
    expect(onTotpRecoveryCodesChange).toHaveBeenCalledWith(['CODE-1', 'CODE-2']);
  });
});
