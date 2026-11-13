/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import UpdateNotificationBanner from './UpdateNotificationBanner';
import type { UseAutoUpdateCheckResult } from '../hooks/useAutoUpdateCheck';

const mockAutoUpdate: UseAutoUpdateCheckResult = {
  updateInfo: {
    currentVersion: '7.0.7.0',
    version: '7.1.0.0',
    body: 'Security updates and improvements',
    date: '2026-09-22',
  },
  isVisible: true,
  isDownloading: false,
  downloadProgress: 0,
  isReadyToRestart: false,
  errorMessage: null,
  channel: 'desktop',
  dismissBanner: vi.fn(),
  applyUpdate: vi.fn().mockResolvedValue(undefined),
  restartNow: vi.fn().mockResolvedValue(undefined),
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UpdateNotificationBanner', () => {
  it('does not render when not visible', () => {
    render(<UpdateNotificationBanner autoUpdate={{ ...mockAutoUpdate, isVisible: false }} />);
    expect(screen.queryByTestId('update-notification-banner')).toBeNull();
  });

  it('does not render when updateInfo is null', () => {
    render(<UpdateNotificationBanner autoUpdate={{ ...mockAutoUpdate, updateInfo: null }} />);
    expect(screen.queryByTestId('update-notification-banner')).toBeNull();
  });

  it('renders available update notification with action buttons', () => {
    render(
      <LanguageProvider>
        <UpdateNotificationBanner autoUpdate={mockAutoUpdate} />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('update-notification-banner')).toBeTruthy();
    expect(screen.getByText('v7.1.0.0')).toBeTruthy();
    expect(screen.getByTestId('banner-update-now-button')).toBeTruthy();
    expect(screen.getByTestId('banner-later-button')).toBeTruthy();
  });

  it('triggers applyUpdate when Update Now button is clicked', () => {
    render(
      <LanguageProvider>
        <UpdateNotificationBanner autoUpdate={mockAutoUpdate} />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByTestId('banner-update-now-button'));
    expect(mockAutoUpdate.applyUpdate).toHaveBeenCalledTimes(1);
  });

  it('triggers dismissBanner when Later or Close button is clicked', () => {
    render(
      <LanguageProvider>
        <UpdateNotificationBanner autoUpdate={mockAutoUpdate} />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByTestId('banner-later-button'));
    expect(mockAutoUpdate.dismissBanner).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('banner-close-button'));
    expect(mockAutoUpdate.dismissBanner).toHaveBeenCalledTimes(2);
  });

  it('renders restart button when update is ready to restart', () => {
    render(
      <LanguageProvider>
        <UpdateNotificationBanner
          autoUpdate={{
            ...mockAutoUpdate,
            isReadyToRestart: true,
          }}
        />
      </LanguageProvider>,
    );

    const restartBtn = screen.getByTestId('banner-restart-button');
    expect(restartBtn).toBeTruthy();
    fireEvent.click(restartBtn);
    expect(mockAutoUpdate.restartNow).toHaveBeenCalledTimes(1);
  });

  it('offers the APK download on Android instead of an in-app install', () => {
    // The Tauri updater does not support Android, so the action hands the
    // download to the browser. The button must say so: "Update Now" would
    // promise an install the app cannot perform.
    render(
      <LanguageProvider>
        <UpdateNotificationBanner
          autoUpdate={{
            ...mockAutoUpdate,
            channel: 'android',
          }}
        />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('banner-update-now-button').textContent).toContain('APK');
    expect(screen.getByTestId('update-android-notice')).toBeTruthy();
  });

  it('states that the offered build is not OS-signed', () => {
    render(
      <LanguageProvider>
        <UpdateNotificationBanner
          autoUpdate={{
            ...mockAutoUpdate,
            updateInfo: {
              ...mockAutoUpdate.updateInfo!,
              isUnsignedBuild: true,
              unsignedPlatforms: ['windows'],
            },
          }}
        />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('update-unsigned-notice')).toBeTruthy();
  });
});
