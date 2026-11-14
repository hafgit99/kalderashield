/**
 * @file UpdateNotificationBanner.tsx
 * @description Floating notification banner alerting user to available app updates.
 *
 * The banner is what makes an automatic check useful: it names the new version,
 * offers the action, and -- when the release carries notes -- lets the user read
 * what changed before deciding. The notes are collapsed by default so the
 * banner stays a banner.
 *
 * @license Apache-2.0
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Download, RefreshCw, Sparkles, X } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { ProgressFill } from './ui/ProgressFill';
import type { UseAutoUpdateCheckResult } from '../hooks/useAutoUpdateCheck';

interface UpdateNotificationBannerProps {
  autoUpdate: UseAutoUpdateCheckResult;
}

export default function UpdateNotificationBanner({ autoUpdate }: UpdateNotificationBannerProps) {
  const { t } = useLanguage();
  const [showDetails, setShowDetails] = useState(false);
  const {
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
  } = autoUpdate;

  if (!isVisible || !updateInfo) {
    return null;
  }

  // On Android the updater cannot install anything: the action opens the APK
  // in the browser and the user confirms the installation.
  const isAndroid = channel === 'android';
  const releaseNotes = (updateInfo.body || '').trim();
  const hasReleaseNotes = releaseNotes.length > 0;

  return (
    <div
      data-testid="update-notification-banner"
      className="relative z-30 mx-3 sm:mx-6 my-2 p-3 sm:p-4 rounded-xl border border-brand-primary/30 bg-surface-high/95 backdrop-blur-md shadow-lg shadow-brand-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-300"
    >
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-brand-primary/15 border border-brand-primary/25 flex items-center justify-center text-brand-primary shrink-0">
          {isReadyToRestart ? (
            <RefreshCw className="w-4.5 h-4.5 text-brand-tertiary" />
          ) : isDownloading ? (
            <Download className="w-4.5 h-4.5 animate-bounce text-brand-primary" />
          ) : (
            <Sparkles className="w-4.5 h-4.5" />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface">
              {isReadyToRestart
                ? t('settings.updates.readyToRestart')
                : t('update.banner.availableTitle')}
            </h4>
            <span className="text-[10px] font-mono font-bold bg-brand-primary/20 text-brand-primary px-1.5 py-0.2 rounded border border-brand-primary/30">
              v{updateInfo.version}
            </span>
          </div>
          <p className="text-xs text-on-surface-variant/90 truncate mt-0.5">
            {isDownloading
              ? `${t('update.banner.downloading')} (%${downloadProgress})`
              : isReadyToRestart
                ? t('settings.updates.readyToRestart')
                : t('update.banner.availableDesc', { version: updateInfo.version })}
          </p>
          {updateInfo.isUnsignedBuild && (
            <p
              data-testid="update-unsigned-notice"
              className="text-[11px] text-amber-400/90 mt-1"
            >
              {t('update.banner.unsignedNotice')}
            </p>
          )}
          {isAndroid && (
            <p
              data-testid="update-android-notice"
              className="text-[11px] text-on-surface-variant/80 mt-1"
            >
              {t('update.banner.androidNotice')}
            </p>
          )}
          {errorMessage && (
            <p className="text-[11px] text-red-400 mt-1 font-semibold">{errorMessage}</p>
          )}

          {isDownloading && (
            <div className="w-full sm:w-48 h-1.5 bg-surface-low rounded-full overflow-hidden mt-1.5 border border-outline-variant/20">
              <ProgressFill
                className="h-full bg-brand-primary transition-all duration-300"
                percent={downloadProgress}
              />
            </div>
          )}

          {/* What changed. Collapsed by default: the banner has one job, and a
              release note is a paragraph. */}
          {hasReleaseNotes && !isDownloading && !isReadyToRestart && (
            <div className="mt-1.5">
              <button
                type="button"
                data-testid="banner-details-toggle"
                onClick={() => setShowDetails((current) => !current)}
                aria-expanded={showDetails}
                className="flex items-center gap-1 text-[11px] font-semibold text-brand-primary hover:text-brand-primary/80 transition-colors cursor-pointer"
              >
                {showDetails ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                <span>
                  {showDetails ? t('update.banner.hideDetails') : t('update.banner.details')}
                </span>
              </button>
              {showDetails && (
                <div
                  data-testid="banner-release-notes"
                  className="mt-1.5 max-h-28 overflow-y-auto whitespace-pre-line rounded-lg border border-white/10 bg-surface p-2.5 text-[11px] leading-relaxed text-on-surface-variant"
                >
                  {releaseNotes}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
        {isReadyToRestart ? (
          <button
            type="button"
            data-testid="banner-restart-button"
            onClick={() => void restartNow()}
            className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-brand-tertiary text-surface-lowest hover:bg-brand-tertiary/90 transition-all cursor-pointer shadow-sm"
          >
            {t('settings.updates.restartNow')}
          </button>
        ) : isDownloading ? (
          <span className="text-xs text-on-surface-variant font-mono animate-pulse">
            %{downloadProgress}
          </span>
        ) : (
          <>
            <button
              type="button"
              data-testid="banner-update-now-button"
              onClick={() => void applyUpdate()}
              className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-brand-primary text-surface-lowest hover:bg-brand-primary/90 transition-all cursor-pointer shadow-sm"
            >
              {isAndroid ? t('update.banner.downloadApk') : t('update.banner.updateNow')}
            </button>
            <button
              type="button"
              data-testid="banner-later-button"
              onClick={dismissBanner}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-low transition-all cursor-pointer"
            >
              {t('update.banner.later')}
            </button>
          </>
        )}

        <button
          type="button"
          data-testid="banner-close-button"
          onClick={dismissForVersion}
          className="p-1.5 text-on-surface-variant hover:text-on-surface rounded-lg transition-colors cursor-pointer"
          title={t('update.banner.dismissVersion')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
