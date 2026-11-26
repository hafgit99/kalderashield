/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Database, Lock, Settings, Sliders, Wrench } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { isAndroidAutofillSupported } from '../lib/androidAutofill';
import { subscribeDesktopSecureStorage } from '../lib/secureStorage';
import { isAccountSecretKeyRequired, isRememberSecretKeySupported } from '../lib/storage';
import { useSettingsVaultItems } from '../hooks/useSettingsVaultItems';
import { useSettingsPassword } from '../hooks/useSettingsPassword';
import { useSettingsBiometric } from '../hooks/useSettingsBiometric';
import { useSettingsEmergencyKit } from '../hooks/useSettingsEmergencyKit';
import { useSettingsStorageMigration } from '../hooks/useSettingsStorageMigration';
import { useSettingsExtensionToken } from '../hooks/useSettingsExtensionToken';
import { useSettingsPasskey } from '../hooks/useSettingsPasskey';
import { useSettingsBackupImport } from '../hooks/useSettingsBackupImport';
import { SettingsLanguageCard } from './settings/SettingsLanguageCard';
import { SettingsThemeCard } from './settings/SettingsThemeCard';
import { SettingsPasswordCard } from './settings/SettingsPasswordCard';
import { SettingsStatsCard } from './settings/SettingsStatsCard';
import { SettingsLegalCard } from './settings/SettingsLegalCard';
import { LegalTermsModal } from './lock/LegalTermsModal';
import type { LegalTermsTab } from './lock/LegalTermsModal';
import { BlockedRequestsPanel } from './settings/BlockedRequestsPanel';
import { SettingsBiometricCard } from './settings/SettingsBiometricCard';
import { SettingsAutofillCard } from './settings/SettingsAutofillCard';
import { SettingsSyncSection } from './settings/SettingsSyncSection';
import { SettingsBackupSection } from './settings/SettingsBackupSection';
import { SettingsRecoverySection } from './settings/SettingsRecoverySection';
import { SettingsDangerZone } from './settings/SettingsDangerZone';
import { SettingsEmergencyKitCard } from './settings/SettingsEmergencyKitCard';
import { SettingsAutoLockCard } from './settings/SettingsAutoLockCard';
import { SettingsStorageMigrationCard } from './settings/SettingsStorageMigrationCard';
import { SettingsExtensionTokenCard } from './settings/SettingsExtensionTokenCard';
import { SettingsUpdateCard } from './settings/SettingsUpdateCard';
import PasswordConfirmModal from './PasswordConfirmModal';
import { PasskeyManager } from './PasskeyManager';
import type { AppNotification } from '../types';

interface SettingsPanelProps {
  onDatabaseChanged: () => void | Promise<void>;
  autoLockDuration: number;
  onAutoLockDurationChange: (duration: number) => void;
  onNotify?: (notification: AppNotification) => void;
}

export default function SettingsPanel({
  onDatabaseChanged,
  autoLockDuration,
  onAutoLockDurationChange,
  onNotify,
}: SettingsPanelProps) {
  const { language, setLanguage, t } = useLanguage();

  // Which document the legal modal opens on. Null means closed; the card passes
  // the tab it was clicked from, so Settings -> Terms lands on the terms rather
  // than on whichever one was read last.
  const [legalTab, setLegalTab] = useState<LegalTermsTab | null>(null);
  const [activeSection, setActiveSection] = useState<'all' | 'general' | 'security' | 'backup' | 'advanced'>('all');
  const showSection = (section: 'general' | 'security' | 'backup' | 'advanced') =>
    activeSection === 'all' || activeSection === section;

  /* Whether the emergency kit has anything to recover on this platform.
   * Subscribe to desktop secure storage so the card appears as soon as the
   * OS credential store finishes hydrating on cold start. */
  const requiresSecretKey = isAccountSecretKeyRequired();
  const [canRememberSecretKey, setCanRememberSecretKey] = useState(() => isRememberSecretKeySupported());

  useEffect(() => {
    return subscribeDesktopSecureStorage(() => {
      setCanRememberSecretKey(isRememberSecretKeySupported());
    });
  }, []);

  const {
    items,
    setItems,
    triggerReseed,
    triggerResetAll,
  } = useSettingsVaultItems({ onDatabaseChanged, onNotify });

  const {
    oldPassword,
    newPassword,
    confirmPassword,
    passwordError,
    passwordSuccess,
    onOldPasswordChange,
    onNewPasswordChange,
    onConfirmPasswordChange,
    handlePasswordChange,
  } = useSettingsPassword({ onDatabaseChanged });

  const {
    biometricEnabled,
    biometricError,
    biometricSuccess,
    biometricLoading,
    isPasswordPromptOpen,
    passwordPromptError,
    isConfirmingBiometricPassword,
    autofillEnabled,
    autofillMessage,
    autofillError,
    handleToggleBiometric,
    handleConfirmBiometricPassword,
    handleOpenAndroidAutofillSettings,
    closePasswordPrompt,
  } = useSettingsBiometric();

  const {
    emergencySecretKey,
    onEmergencySecretKeyChange,
    emergencyKitSuccess,
    emergencyKitError,
    handleDownloadEmergencyKit,
    handleDownloadEmergencyKitPdf,
  } = useSettingsEmergencyKit();

  const {
    storageMigrationStatus,
    storageMigrationMessage,
    handleWaSqliteMigration,
  } = useSettingsStorageMigration({ onDatabaseChanged, onNotify });

  const {
    tokenRotateStatus,
    tokenRotateMessage,
    handleRotateToken,
  } = useSettingsExtensionToken();

  const {
    passkeyStatusKey,
    passkeyStatusKind,
    passkeyBusy,
    handleCreatePasskey,
    handleAuthenticatePasskey,
    handleDeletePasskey,
    passkeyRecords,
  } = useSettingsPasskey({
    items,
    setItems,
    onDatabaseChanged,
  });

  const {
    useMasterForBackup,
    setUseMasterForBackup,
    customBackupPassword,
    setCustomBackupPassword,
    backupSuccess,
    backupError,
    isExporting,
    onExportEncrypted,
    onExportPlain,
    plainExportArmed,
    plainExportConfirmation,
    setPlainExportConfirmation,
    holdProgress,
    startHoldExport,
    cancelHoldExport,
    importState,
    decryptPasswordInput,
    setDecryptPasswordInput,
    handleDecryptAndImport,
    resetImportFlowState,
    onDragOver,
    onDragLeave,
    onDrop,
    triggerImportSelect,
    isDragOver,
    fileInputRef,
    handleFileSelect,
  } = useSettingsBackupImport({
    setItems,
    onDatabaseChanged,
  });

  // Auto-Lock Option Selectors
  const lockOptions = [
    { value: 15, label: t('settings.autoLock.15s') },
    { value: 30, label: t('settings.autoLock.30s') },
    { value: 60, label: t('settings.autoLock.1m') },
    { value: 300, label: t('settings.autoLock.5m') },
    { value: 900, label: t('settings.autoLock.15m') },
    { value: 1800, label: t('settings.autoLock.30m') },
    { value: 3600, label: t('settings.autoLock.1h') },
    { value: 7200, label: t('settings.autoLock.2h') }
  ];

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto pb-6 sm:pb-10" id="settings-panel-container">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-1 sm:mb-2" id="settings-title-section">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center border border-brand-primary/20">
            <Settings className="w-5 h-5 text-brand-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-display text-on-surface">{t('settings.title')}</h2>
            <p className="hidden sm:block text-xs text-on-surface-variant">{t('settings.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div
        role="tablist"
        aria-label={t('settings.title')}
        data-testid="settings-section-tabs"
        className="flex flex-wrap items-center gap-1.5 bg-surface-low p-1.5 rounded-xl border border-outline-variant/15"
      >
        {([
          { id: 'all', icon: Settings, label: t('detail.category.all', 'All') },
          { id: 'general', icon: Sliders, label: t('vaultForm.general.title') },
          { id: 'security', icon: Lock, label: t('nav.audit') },
          { id: 'backup', icon: Database, label: t('settings.sync.title') },
          { id: 'advanced', icon: Wrench, label: t('nav.systemHealth') },
        ] as const).map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              data-testid={`settings-tab-${tab.id}`}
              onClick={() => setActiveSection(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                isSelected
                  ? 'bg-brand-primary text-brand-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-high/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {showSection('general') && (
        <>
          <SettingsLanguageCard
            language={language}
            onLanguageChange={setLanguage}
          />

          <SettingsThemeCard />

          {/* The legal documents are permanent, not a first-run obstacle, so they are
              readable from inside the app without locking the vault first. */}
          <SettingsLegalCard onOpenLegal={(tab) => setLegalTab(tab)} />
        </>
      )}

      {showSection('security') && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6" id="settings-top-row">
            <SettingsStatsCard
              itemCount={items.length}
              onReseedDemo={triggerReseed}
            />

            <SettingsPasswordCard
              oldPassword={oldPassword}
              newPassword={newPassword}
              confirmPassword={confirmPassword}
              passwordError={passwordError}
              passwordSuccess={passwordSuccess}
              onOldPasswordChange={onOldPasswordChange}
              onNewPasswordChange={onNewPasswordChange}
              onConfirmPasswordChange={onConfirmPasswordChange}
              onSubmit={handlePasswordChange}
            />
          </div>

          {/*
            Emergency Kit Card.

            Hidden only when there is provably nothing to recover: the vault does
            not use a Secret Key, and this platform cannot create one. Showing it
            there asked the user to type a key that protects nothing.

            It stays whenever either half holds. A vault sealed with a Secret Key
            needs its kit on every platform, including the ones that cannot store
            the key themselves -- that is exactly the device the kit exists for.
          */}
          {(requiresSecretKey || canRememberSecretKey) && (
            <SettingsEmergencyKitCard
              emergencySecretKey={emergencySecretKey}
              onEmergencySecretKeyChange={onEmergencySecretKeyChange}
              emergencyKitSuccess={emergencyKitSuccess}
              emergencyKitError={emergencyKitError}
              onDownloadEmergencyKit={handleDownloadEmergencyKit}
              onDownloadEmergencyKitPdf={handleDownloadEmergencyKitPdf}
            />
          )}

          {/* Dynamic Auto-Lock Interval Card */}
          <SettingsAutoLockCard
            autoLockDuration={autoLockDuration}
            lockOptions={lockOptions}
            onAutoLockDurationChange={onAutoLockDurationChange}
          />

          {/* Biometric Lock Settings Card */}
          <SettingsBiometricCard
            biometricEnabled={biometricEnabled}
            biometricLoading={biometricLoading}
            biometricSuccess={biometricSuccess}
            biometricError={biometricError}
            onToggleBiometric={handleToggleBiometric}
          />

          {/* Recovery Options (Recovery Key & Password Hint) */}
          <SettingsRecoverySection />

          {/* Android Autofill Settings Card */}
          {isAndroidAutofillSupported() && (
            <SettingsAutofillCard
              autofillEnabled={autofillEnabled}
              autofillMessage={autofillMessage}
              autofillError={autofillError}
              onOpenAutofillSettings={handleOpenAndroidAutofillSettings}
            />
          )}

          {/* Passkey (WebAuthn) management */}
          <PasskeyManager
            records={passkeyRecords}
            statusKey={passkeyStatusKey}
            statusKind={passkeyStatusKind}
            busy={passkeyBusy}
            onCreatePasskey={handleCreatePasskey}
            onAuthenticatePasskey={handleAuthenticatePasskey}
            onDeletePasskey={handleDeletePasskey}
          />
        </>
      )}

      {showSection('backup') && (
        <>
          {/* Backup, Encryption, and Import Rows */}
          <SettingsBackupSection
            onDatabaseChanged={onDatabaseChanged}
            onNotify={(msg, kind) =>
              onNotify?.({
                title: 'KalderaShield',
                message: msg,
                type: kind === 'error' ? 'danger' : (kind || 'info'),
              })
            }
            useMasterForBackup={useMasterForBackup}
            setUseMasterForBackup={setUseMasterForBackup}
            customBackupPassword={customBackupPassword}
            setCustomBackupPassword={setCustomBackupPassword}
            backupSuccess={backupSuccess}
            backupError={backupError}
            isExporting={isExporting}
            onExportEncrypted={onExportEncrypted}
            onExportPlain={onExportPlain}
            plainExportArmed={plainExportArmed}
            plainExportConfirmation={plainExportConfirmation}
            setPlainExportConfirmation={setPlainExportConfirmation}
            holdProgress={holdProgress}
            startHoldExport={startHoldExport}
            cancelHoldExport={cancelHoldExport}
            importState={importState}
            decryptPasswordInput={decryptPasswordInput}
            setDecryptPasswordInput={setDecryptPasswordInput}
            handleDecryptAndImport={handleDecryptAndImport}
            resetImportFlowState={resetImportFlowState}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            triggerImportSelect={triggerImportSelect}
            isDragOver={isDragOver}
            fileInputRef={fileInputRef}
            handleFileSelect={handleFileSelect}
          />

          {/* Cloud Sync (E2EE) Section */}
          <SettingsSyncSection />
        </>
      )}

      {showSection('advanced') && (
        <>
          {/* Blocked Network Requests (Air-Gap policy log) */}
          <BlockedRequestsPanel />

          {/* Storage Backend Migration Section */}
          <SettingsStorageMigrationCard
            storageMigrationStatus={storageMigrationStatus}
            storageMigrationMessage={storageMigrationMessage}
            onMigrate={handleWaSqliteMigration}
          />

          {/* Extension Token Rotation — desktop only */}
          <SettingsExtensionTokenCard
            tokenRotateStatus={tokenRotateStatus}
            tokenRotateMessage={tokenRotateMessage}
            onRotateToken={handleRotateToken}
          />

          {/* Desktop App Auto-Updates */}
          <SettingsUpdateCard />

          {/* Extreme Danger Zone */}
          <SettingsDangerZone
            onResetAll={triggerResetAll}
          />
        </>
      )}

      {/* Biometric Master Password Confirmation Modal */}
      <PasswordConfirmModal
        isOpen={isPasswordPromptOpen}
        isLoading={isConfirmingBiometricPassword}
        errorMessage={passwordPromptError}
        onConfirm={handleConfirmBiometricPassword}
        onCancel={closePasswordPrompt}
      />

      {/* Privacy Policy and Terms of Use, opened from the card above. The key
          makes each open a fresh instance, so the tab matches the button that
          was clicked rather than whatever was read last. */}
      <LegalTermsModal
        key={legalTab ?? 'closed'}
        isOpen={legalTab !== null}
        initialTab={legalTab ?? 'terms'}
        onClose={() => setLegalTab(null)}
      />
    </div>
  );
}