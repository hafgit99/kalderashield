// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useExtensionCredentialListener } from './useExtensionCredentialListener';

type ListenHandler = (event: { payload: unknown }) => void;

const listenMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/event', () => ({ listen: listenMock }));

function emitCredentialEvent(handler: ListenHandler, payload: unknown) {
  handler({ payload });
}

describe('useExtensionCredentialListener', () => {
  let unlistenAdd: ReturnType<typeof vi.fn>;
  let unlistenUpdate: ReturnType<typeof vi.fn>;
  let capturedHandlers: Record<string, ListenHandler>;

  beforeEach(() => {
    unlistenAdd = vi.fn();
    unlistenUpdate = vi.fn();
    capturedHandlers = {};
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    listenMock.mockReset().mockImplementation((event: string, handler: ListenHandler) => {
      capturedHandlers[event] = handler;
      if (event === 'update-credential-from-extension') {
        return Promise.resolve(unlistenUpdate);
      }
      return Promise.resolve(unlistenAdd);
    });
  });

  it('normalises the extension payload and forwards it to the callback', async () => {
    const onAddCredential = vi.fn();
    renderHook(() => useExtensionCredentialListener(onAddCredential));

    await waitFor(() => expect(listenMock).toHaveBeenCalledWith('add-credential-from-extension', expect.any(Function)));
    emitCredentialEvent(capturedHandlers['add-credential-from-extension']!, {
      title: 'GitHub',
      username: 'octo',
      password: 's3cret',
    });

    expect(onAddCredential).toHaveBeenCalledWith({
      title: 'GitHub',
      username: 'octo',
      password: 's3cret',
      url: '',
    });
  });

  it('forwards valid password-update payloads and ignores incomplete ones', async () => {
    const onAddCredential = vi.fn();
    const onUpdateCredential = vi.fn();
    const { unmount } = renderHook(() =>
      useExtensionCredentialListener(onAddCredential, onUpdateCredential),
    );

    await waitFor(() =>
      expect(listenMock).toHaveBeenCalledWith('update-credential-from-extension', expect.any(Function)),
    );

    emitCredentialEvent(capturedHandlers['update-credential-from-extension']!, {
      id: '  item-42  ',
      title: 'GitHub',
      username: 'octo',
      password: 'NewStrongPassword!99',
      url: 'https://github.com/settings/security',
    });

    expect(onUpdateCredential).toHaveBeenCalledWith({
      id: 'item-42',
      title: 'GitHub',
      username: 'octo',
      password: 'NewStrongPassword!99',
      url: 'https://github.com/settings/security',
    });

    // Missing id or password must be ignored
    emitCredentialEvent(capturedHandlers['update-credential-from-extension']!, {
      id: '',
      password: 'NewStrongPassword!99',
    });
    emitCredentialEvent(capturedHandlers['update-credential-from-extension']!, {
      id: 'item-42',
      password: '',
    });
    expect(onUpdateCredential).toHaveBeenCalledTimes(1);

    unmount();
    expect(unlistenAdd).toHaveBeenCalledTimes(1);
    expect(unlistenUpdate).toHaveBeenCalledTimes(1);
  });

  it('ignores empty payloads and unsubscribes on unmount', async () => {
    const onAddCredential = vi.fn();
    const { unmount } = renderHook(() => useExtensionCredentialListener(onAddCredential));

    await waitFor(() => expect(listenMock).toHaveBeenCalled());
    emitCredentialEvent(capturedHandlers['add-credential-from-extension']!, null);
    expect(onAddCredential).not.toHaveBeenCalled();

    unmount();
    expect(unlistenAdd).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe outside the Tauri runtime', () => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    const onAddCredential = vi.fn();
    renderHook(() => useExtensionCredentialListener(onAddCredential));
    expect(listenMock).not.toHaveBeenCalled();
  });
});
