/**
 * @file useAppUpdater.ts
 * @description React hook for checking and installing app updates.
 *
 * Two channels live behind this hook:
 *
 *   - Desktop (Windows, Linux, macOS): the Tauri updater. The client downloads
 *     the payload, verifies its minisign signature against the public key in
 *     `tauri.conf.json`, and installs it.
 *   - Android: the sideload channel. The Tauri updater does not support
 *     Android, so the check reads `android-latest.json` and the action opens
 *     the APK in the system browser; Android then performs an in-place update.
 *
 * Both report through the same `AppUpdateInfo`, so the settings card does not
 * have to know which channel it is talking to. The one thing it does need to
 * know is which action to offer, and that is what `platform` is for.
 *
 * @license Apache-2.0
 */

import { useState, useCallback } from 'react';
import {
  checkAppUpdate,
  downloadAndApplyUpdate,
  restartApplication,
  type AppUpdateInfo,
  type UpdateDownloadProgress,
} from '../lib/updater';
import { checkAndroidUpdate, openAndroidUpdate, type AndroidUpdateInfo } from '../lib/androidUpdate';
import { isAndroidRuntime, isDesktopAppUpdaterSupported } from '../lib/environment';

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'upToDate'
  | 'error';

export type UpdateChannel = 'desktop' | 'android';

export interface UseAppUpdaterResult {
  status: UpdaterStatus;
  supported: boolean;
  channel: UpdateChannel;
  updateInfo: AppUpdateInfo | null;
  progress: UpdateDownloadProgress;
  errorMessage: string | null;
  errorKey: string | null;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
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

export function useAppUpdater(): UseAppUpdaterResult {
  const [status, setStatus] = useState<UpdaterStatus>('idle');
  const [supported, setSupported] = useState<boolean>(
    () => isDesktopAppUpdaterSupported() || isAndroidRuntime(),
  );
  const [channel, setChannel] = useState<UpdateChannel>(() =>
    isAndroidRuntime() ? 'android' : 'desktop',
  );
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [androidUpdate, setAndroidUpdate] = useState<AndroidUpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateDownloadProgress>({ downloaded: 0, percent: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const checkForUpdates = useCallback(async () => {
    setStatus('checking');
    setErrorMessage(null);
    setErrorKey(null);

    if (isAndroidRuntime()) {
      setChannel('android');
      const result = await checkAndroidUpdate();
      setSupported(result.supported);

      if (result.error) {
        setStatus('error');
        setErrorMessage(result.error);
        setErrorKey(null);
        return;
      }

      if (result.hasUpdate && result.updateInfo) {
        setAndroidUpdate(result.updateInfo);
        setUpdateInfo(toAppUpdateInfo(result.updateInfo));
        setStatus('available');
      } else {
        setAndroidUpdate(null);
        setUpdateInfo(null);
        setStatus('upToDate');
      }
      return;
    }

    setChannel('desktop');
    const result = await checkAppUpdate();
    setSupported(result.supported);

    if (!result.supported) {
      setStatus('idle');
      return;
    }

    if (result.error) {
      setStatus('error');
      setErrorMessage(result.error);
      setErrorKey(result.errorKey || null);
      return;
    }

    if (result.hasUpdate && result.updateInfo) {
      setUpdateInfo(result.updateInfo);
      setStatus('available');
    } else {
      setUpdateInfo(null);
      setStatus('upToDate');
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (isAndroidRuntime()) {
      if (!androidUpdate) {
        setStatus('error');
        setErrorMessage('No update available to open.');
        return;
      }
      const result = await openAndroidUpdate(androidUpdate.url);
      if (!result.success) {
        setStatus('error');
        setErrorMessage(result.error || 'The download page could not be opened.');
        return;
      }
      // The install happens outside the app; the app stays on this version
      // until the user confirms it, so there is nothing to restart here.
      setStatus('available');
      return;
    }

    setStatus('downloading');
    setErrorMessage(null);
    setErrorKey(null);
    setProgress({ downloaded: 0, percent: 0 });

    const result = await downloadAndApplyUpdate((p) => {
      setProgress(p);
    });

    if (result.success) {
      setStatus('downloaded');
    } else {
      setStatus('error');
      setErrorMessage(result.error || 'Failed to install update.');
    }
  }, [androidUpdate]);

  const restartNow = useCallback(async () => {
    await restartApplication();
  }, []);

  return {
    status,
    supported,
    channel,
    updateInfo,
    progress,
    errorMessage,
    errorKey,
    checkForUpdates,
    installUpdate,
    restartNow,
  };
}
