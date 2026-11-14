/**
 * @vitest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as updater from '../lib/updater';
import * as environment from '../lib/environment';
import { useAutoUpdateCheck } from './useAutoUpdateCheck';

const STARTUP_DELAY_MS = 3000;
const DISMISSED_VERSION_KEY = 'KalderaShield_dismissed_update_version';

function mockUpdate(version: string, body?: string) {
  return vi.spyOn(updater, 'checkAppUpdate').mockResolvedValue({
    supported: true,
    hasUpdate: true,
    updateInfo: {
      currentVersion: '7.0.7.0',
      version,
      body,
    },
  });
}

async function advanceStartupDelay() {
  await act(async () => {
    vi.advanceTimersByTime(STARTUP_DELAY_MS);
  });
}

describe('useAutoUpdateCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.spyOn(environment, 'isDesktopAppUpdaterSupported').mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('initializes with default hidden state', () => {
    const { result } = renderHook(() => useAutoUpdateCheck(false));

    expect(result.current.isVisible).toBe(false);
    expect(result.current.updateInfo).toBeNull();
    expect(result.current.isDownloading).toBe(false);
  });

  it('checks for an update a few seconds after start when enabled', async () => {
    const checkSpy = mockUpdate('7.1.0.0', 'Security fixes');

    const { result } = renderHook(() => useAutoUpdateCheck(true));

    expect(checkSpy).not.toHaveBeenCalled();

    await advanceStartupDelay();

    expect(checkSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isVisible).toBe(true);
    expect(result.current.updateInfo?.version).toBe('7.1.0.0');
    expect(result.current.updateInfo?.body).toBe('Security fixes');
  });

  // The finding this closes: the hook used to check at most once per 24 hours,
  // so a user who launches the app daily saw the check only when the interval
  // happened to have elapsed -- indistinguishable from "it never checks".
  it('checks on every start, not once per day', async () => {
    const checkSpy = mockUpdate('7.1.0.0');

    const first = renderHook(() => useAutoUpdateCheck(true));
    await advanceStartupDelay();
    expect(checkSpy).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useAutoUpdateCheck(true));
    await advanceStartupDelay();
    expect(checkSpy).toHaveBeenCalledTimes(2);
    expect(second.result.current.updateInfo?.version).toBe('7.1.0.0');
  });

  it('dismisses the banner for this session only', async () => {
    mockUpdate('7.1.0.0');

    const { result } = renderHook(() => useAutoUpdateCheck(true));
    await advanceStartupDelay();
    expect(result.current.isVisible).toBe(true);

    act(() => {
      result.current.dismissBanner();
    });

    expect(result.current.isVisible).toBe(false);
    expect(localStorage.getItem(DISMISSED_VERSION_KEY)).toBeNull();
  });

  it('remembers the version closed with the X, and still exposes the update', async () => {
    mockUpdate('7.1.0.0');

    const { result } = renderHook(() => useAutoUpdateCheck(true));
    await advanceStartupDelay();

    act(() => {
      result.current.dismissForVersion();
    });

    expect(result.current.isVisible).toBe(false);
    expect(localStorage.getItem(DISMISSED_VERSION_KEY)).toBe('7.1.0.0');
    // The settings card still needs the version; only the banner is suppressed.
    expect(result.current.updateInfo?.version).toBe('7.1.0.0');
  });

  it('does not announce a version the user already closed', async () => {
    localStorage.setItem(DISMISSED_VERSION_KEY, '7.1.0.0');
    mockUpdate('7.1.0.0');

    const { result } = renderHook(() => useAutoUpdateCheck(true));
    await advanceStartupDelay();

    expect(result.current.isVisible).toBe(false);
    expect(result.current.updateInfo?.version).toBe('7.1.0.0');
  });

  it('announces a newer release even when an older one was dismissed', async () => {
    localStorage.setItem(DISMISSED_VERSION_KEY, '7.1.0.0');
    mockUpdate('7.1.1.0');

    const { result } = renderHook(() => useAutoUpdateCheck(true));
    await advanceStartupDelay();

    expect(result.current.isVisible).toBe(true);
    expect(result.current.updateInfo?.version).toBe('7.1.1.0');
  });
});
