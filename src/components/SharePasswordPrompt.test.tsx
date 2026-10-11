/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import SharePasswordPrompt from './SharePasswordPrompt';
import { LanguageProvider } from '../i18n/LanguageContext';

function renderPrompt(props: Partial<React.ComponentProps<typeof SharePasswordPrompt>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  render(
    <LanguageProvider>
      <SharePasswordPrompt
        isOpen
        error={null}
        onSubmit={onSubmit}
        onCancel={onCancel}
        {...props}
      />
    </LanguageProvider>,
  );
  return { onSubmit, onCancel };
}

afterEach(() => {
  cleanup();
});

describe('SharePasswordPrompt', () => {
  // The prompt was never rendered at all: `useShareReceive` computed
  // `isSharePasswordPromptOpen`, `shareReceiveError` and `submitSharePassword`
  // but no component consumed them, so opening a share link silently did
  // nothing for the recipient. These assert the prompt exists, which the
  // hook's own tests could not.
  it('renders a password field and submit control', () => {
    renderPrompt();

    expect(screen.getByTestId('receive-share-password-input')).toBeTruthy();
    expect(screen.getByTestId('receive-share-unlock-button')).toBeTruthy();
  });

  it('keeps submit disabled until a password is typed', () => {
    renderPrompt();

    const submit = screen.getByTestId('receive-share-unlock-button') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('receive-share-password-input'), { target: { value: 'x' } });
    expect(submit.disabled).toBe(false);
  });

  it('submits the typed password', async () => {
    const { onSubmit } = renderPrompt();

    fireEvent.change(screen.getByTestId('receive-share-password-input'), { target: { value: 'share-secret-123' } });
    fireEvent.click(screen.getByTestId('receive-share-unlock-button'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('share-secret-123');
    });
  });

  it('clears the field after a failed attempt so the next try starts empty', async () => {
    const { onSubmit } = renderPrompt();

    fireEvent.change(screen.getByTestId('receive-share-password-input'), { target: { value: 'wrong-one' } });
    fireEvent.click(screen.getByTestId('receive-share-unlock-button'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    // `submitSharePassword` owns the error message; the field must not keep
    // the rejected password sitting in it.
    await waitFor(() => {
      expect((screen.getByTestId('receive-share-password-input') as HTMLInputElement).value).toBe('');
    });
  });

  it('surfaces the receive error, which carries the K-2 lockout delay', () => {
    renderPrompt({ error: 'Incorrect password or the link has expired. (4s)' });

    const alert = screen.getByTestId('receive-share-error');
    expect(alert.textContent).toContain('4s');
  });

  it('cancels without submitting', () => {
    const { onSubmit, onCancel } = renderPrompt();

    fireEvent.change(screen.getByTestId('receive-share-password-input'), { target: { value: 'share-secret-123' } });
    fireEvent.click(screen.getByTestId('receive-share-cancel-button'));

    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders nothing while closed', () => {
    renderPrompt({ isOpen: false });

    expect(screen.queryByTestId('receive-share-password-input')).toBeNull();
  });

  it('marks the field against password managers, like every other secret input', () => {
    renderPrompt();

    const input = screen.getByTestId('receive-share-password-input');
    expect(input.getAttribute('type')).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('data-lpignore')).toBe('true');
    expect(input.getAttribute('data-1p-ignore')).toBe('true');
    expect(input.getAttribute('data-bwignore')).toBe('true');
    expect(input.getAttribute('spellcheck')).toBe('false');
  });
});