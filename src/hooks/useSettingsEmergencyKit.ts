/**
 * @file useSettingsEmergencyKit.ts
 * @description Owns the Emergency Kit download state and flow. Extracted from
 * SettingsPanel.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { saveEmergencyKit } from '../lib/emergencyKit';
import { getRememberedAccountSecretKey } from '../lib/storage';
import { isAccountSecretKeyFormatValid } from '../lib/secretKey';

export function useSettingsEmergencyKit() {
  const { t } = useLanguage();
  const [emergencySecretKey, setEmergencySecretKey] = useState('');
  const [emergencyKitSuccess, setEmergencyKitSuccess] = useState<string | null>(null);
  const [emergencyKitError, setEmergencyKitError] = useState<string | null>(null);

  const handleDownloadEmergencyKit = async () => {
    setEmergencyKitSuccess(null);
    setEmergencyKitError(null);

    // Deliberately no longer gated on `isAccountSecretKeyRequired()`. The
    // vault only seals with an account secret key where the platform can keep
    // it (see `setupMasterPasswordWithSecretKey`), so on desktop and web that
    // check is false and this refused to hand out the key the user was shown
    // during setup and never written anywhere else. The kit is exactly what
    // makes the second key recoverable when the device is lost or the vault is
    // moved, so refusing it there removed the only copy the user could have.
    const secretKey = getRememberedAccountSecretKey() ?? emergencySecretKey;
    if (!isAccountSecretKeyFormatValid(secretKey)) {
      setEmergencyKitError(t('settings.emergencyKit.invalidSecretKey'));
      return;
    }

    try {
      const saved = await saveEmergencyKit(secretKey);
      if (!saved) return;
      setEmergencySecretKey('');
      setEmergencyKitSuccess(t('settings.emergencyKit.success'));
      setTimeout(() => setEmergencyKitSuccess(null), 5000);
    } catch (err: unknown) {
      const message = (err instanceof Error && err.message.trim()) ? err.message : t('settings.export.defaultSaveError');
      setEmergencyKitError(`${t('settings.emergencyKit.errorPrefix')}: ${message}`);
    }
  };

  return {
    emergencySecretKey,
    onEmergencySecretKeyChange: setEmergencySecretKey,
    emergencyKitSuccess,
    emergencyKitError,
    handleDownloadEmergencyKit,
  };
}