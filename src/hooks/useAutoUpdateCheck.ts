/**
 * @file useAutoUpdateCheck.ts
 * @description Checks for app updates on every start and surfaces a banner
 * when a newer version exists.
 *
 * Two channels, one hook:
 *
 *   - Desktop: the Tauri updater. The check runs a few seconds after the vault
 *     is unlocked, on every start, and the banner offers install-in-place.
 *   - Android: the sideload channel (`android-latest.json`), because the Tauri
 *     updater does not support Android. The banner's action opens the APK
 *     download in the browser instead of installing anything.
 *
 * The check used to run at most once every 24 hours. A user who launches the
 * app daily therefore saw the check only when the interval happened to have
 * elapsed, which is indistinguishable from "the app never checks". It now runs
 * once per start. The request is a plain GET for a public release manifest: no
 * vault data, no identifiers, credentials omitted.
 *
 * Closing the banner with the X remembers the version, so the same release is
 * not announced again on the next start; "Later" only hides it until the next
 * start. A newer release always announces itself.
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

const DISMISSED_VERSION_KEY = 'KalderaShield_dismissed_update_version';
const STARTUP_DELAY_MS = 3000; // let the unlock animation finish first

export type UpdateChannel = 'desktop' | 'android';

export interface UseAutoUpdateCheckResult {
  updateInfo: AppUpdateInfo | null;
  isVisible: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  isReadyToRestart: boolean;
  errorMessage: string | null;
  channel: UpdateChannel;
  /** Hides the banner until the next start. */
  dismissBanner: () => void;
  /** Hides the banner and does not announce this version again. */
  dismissForVersion: () => void;
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

function readDismissedVersion(): string | null {
  try {
    return localStorage.getItem(DISMISSED_VERSION_KEY);
  } catch {
    return null;
  }
}

function rememberDismissedVersion(version: string): void {
  try {
    localStorage.setItem(DISMISSED_VERSION_KEY, version);
  } catch {
    // localStorage may be unavailable in restricted sandboxes; the banner then
    // simply appears again on the next start.
  }
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

    const announce = (info: AppUpdateInfo, android: AndroidUpdateInfo | null) => {
      setUpdateInfo(info);
      setAndroidUpdate(android);
      // The check runs on every start; only the version the user closed with
      // the X is suppressed. A newer release always announces itself.
      if (readDismissedVersion() !== info.version) setIsVisible(true);
    };

    if (isAndroidRuntime()) {
      hasTriggeredRef.current = true;

      const timer = setTimeout(async () => {
        try {
          const result = await checkAndroidUpdate();
          if (result.hasUpdate && result.updateInfo) {
            announce(toAppUpdateInfo(result.updateInfo), result.updateInfo);
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

    hasTriggeredRef.current = true;

    const timer = setTimeout(async () => {
      try {
        const result = await checkAppUpdate();
        if (result.hasUpdate && result.updateInfo) {
          announce(result.updateInfo, null);
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

  const dismissForVersion = useCallback(() => {
    setIsVisible(false);
    if (updateInfo?.version) rememberDismissedVersion(updateInfo.version);
  }, [updateInfo]);

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
    dismissForVersion,
    applyUpdate,
    restartNow,
  };
}
