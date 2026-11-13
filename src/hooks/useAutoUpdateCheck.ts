/**
 * @file useAutoUpdateCheck.ts
 * @description Hook that silently checks for app updates once per day.
 * When a newer version is available, it surfaces update info for the notification banner.
 *
 * Two channels, one hook:
 *
 *   - Desktop: the Tauri updater. A daily check, five seconds after the vault
 *     is unlocked, and a banner when there is something newer.
 *   - Android: the sideload channel (`android-latest.json`), because the
 *     Tauri updater does not support Android. The banner's action opens the
 *     APK download in the browser instead of installing anything.
 *
 * @license Apache-2.0
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  checkAppUpdate,
  downloadAndApplyUpdate,
  restartApplication,
  type AppUpdateInfo,
} from '../lib/updater';
import {
  checkAndroidUpdate,
  openAndroidUpdate,
  type AndroidUpdateInfo,
} from '../lib/androidUpdate';
import { isAndroidRuntime, isDesktopAppUpdaterSupported } from '../lib/environment';

const LAST_CHECK_KEY = 'KalderaShield_last_auto_update_check';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const STARTUP_DELAY_MS = 5000; // 5 seconds grace period after unlock

export type UpdateChannel = 'desktop' | 'android';

export interface UseAutoUpdateCheckResult {
  updateInfo: AppUpdateInfo | null;
  isVisible: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  isReadyToRestart: boolean;
  errorMessage: string | null;
  channel: UpdateChannel;
  dismissBanner: () => void;
  applyUpdate: () => Promise<void>;
  restartNow: () => Promise<void>;
}

function toAppUpdateInfo(info: AndroidUpdateInfo): AppUpdateInfo {
  return {
    currentVersion: '',
    version: info.version,
    body: info.notes,
    date: info.publishedAt,
    unsignedPlatforms: [],
    isUnsignedBuild: false,
  };
}

export function useAutoUpdateCheck(enabled = true): UseAutoUpdateCheckResult {
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isReadyToRestart, setIsReadyToRestart] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // The channel cannot change during the lifetime of the app: it is decided by
  // the runtime the app was started in. It is a constant rather than state so
  // that nothing has to be set inside the check effect.
  const channel: UpdateChannel = isAndroidRuntime() ? 'android' : 'desktop';
  const [androidUpdate, setAndroidUpdate] = useState<AndroidUpdateInfo | null>(null);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (!enabled || hasTriggeredRef.current) return;

    // Android first: the Tauri updater is not available there, and the two
    // channels share the daily interval and the banner. The channel itself is
    // already set by the state initialiser, so nothing has to be set here.
    if (isAndroidRuntime()) {
      hasTriggeredRef.current = true;

      const timer = setTimeout(async () => {
        try {
          const result = await checkAndroidUpdate();
          try {
            localStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
          } catch {
            // ignore
          }

          if (result.hasUpdate && result.updateInfo) {
            setAndroidUpdate(result.updateInfo);
            setUpdateInfo(toAppUpdateInfo(result.updateInfo));
            setIsVisible(true);
          }
        } catch (error) {
          console.warn('Android auto update check encountered a non-fatal error:', error);
        }
      }, STARTUP_DELAY_MS);

      return () => {
        clearTimeout(timer);
      };
    }

    if (!isDesktopAppUpdaterSupported()) return;

    // Check last check timestamp in localStorage
    try {
      const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
      if (lastCheck) {
        const elapsed = Date.now() - parseInt(lastCheck, 10);
        if (elapsed < CHECK_INTERVAL_MS) {
          return;
        }
      }
    } catch {
      // localStorage may fail in restricted sandboxes; proceed with check
    }

    hasTriggeredRef.current = true;

    const timer = setTimeout(async () => {
      try {
        const result = await checkAppUpdate();
        try {
          localStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
        } catch {
          // ignore
        }

        if (result.hasUpdate && result.updateInfo) {
          setUpdateInfo(result.updateInfo);
          setIsVisible(true);
        }
      } catch (error) {
        console.warn('Auto update check encountered non-fatal error:', error);
      }
    }, STARTUP_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [enabled]);

  const dismissBanner = useCallback(() => {
    setIsVisible(false);
  }, []);

  const applyUpdate = useCallback(async () => {
    if (channel === 'android') {
      if (!androidUpdate) {
        setErrorMessage('No update available to open.');
        return;
      }
      const result = await openAndroidUpdate(androidUpdate.url);
      if (!result.success) {
        setErrorMessage(result.error || 'The download page could not be opened.');
      }
      return;
    }

    setIsDownloading(true);
    setErrorMessage(null);
    setDownloadProgress(0);

    const result = await downloadAndApplyUpdate((progress) => {
      setDownloadProgress(progress.percent);
    });

    setIsDownloading(false);

    if (result.success) {
      setIsReadyToRestart(true);
    } else {
      setErrorMessage(result.error || 'Update failed');
    }
  }, [channel, androidUpdate]);

  const restartNow = useCallback(async () => {
    await restartApplication();
  }, []);

  return {
    updateInfo,
    isVisible,
    isDownloading,
    downloadProgress,
    isReadyToRestart,
    errorMessage,
    channel,
    dismissBanner,
    applyUpdate,
    restartNow,
  };
}
