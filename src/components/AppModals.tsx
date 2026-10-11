import type { AppConfirmConfig, AppNotification, TagDefinition, VaultFolder, VaultItem } from '../types';
import ConfirmModal from './ConfirmModal';
import ProfileModal from './ProfileModal';
import VaultFormModal from './VaultFormModal';
import ShareModal from './ShareModal';
import SharePasswordPrompt from './SharePasswordPrompt';
import ReceiveShareModal from './ReceiveShareModal';
import type { DecryptedSharePayload } from '../lib/share';

interface AppModalsProps {
  isVaultFormOpen: boolean;
  editingItem: VaultItem | null;
  isProfileOpen: boolean;
  profileAvatar: string;
  profileName: string;
  confirmConfig: AppConfirmConfig;
  onCloseVaultForm: () => void;
  onSaveVaultItem: (item: VaultItem) => void | Promise<void>;
  onNotify: (notification: AppNotification) => void;
  onCloseProfile: () => void;
  onSaveProfile: (name: string, avatar: string) => void;
  onCancelConfirm: () => void;
  folders: VaultFolder[];
  tags: TagDefinition[];
  // Share & Receive Modals
  isShareOpen: boolean;
  sharingItem: VaultItem | null;
  onCloseShare: () => void;
  isReceiveOpen: boolean;
  receivedPayload: DecryptedSharePayload | null;
  onCloseReceive: () => void;
  onImportShare: (item: Partial<VaultItem>) => void | Promise<void>;
  isSharePasswordPromptOpen: boolean;
  shareReceiveError: string | null;
  onSubmitSharePassword: (password: string) => void | Promise<void>;
  onCancelSharePasswordPrompt: () => void;
}

export default function AppModals({
  isVaultFormOpen,
  editingItem,
  isProfileOpen,
  profileAvatar,
  profileName,
  confirmConfig,
  onCloseVaultForm,
  onSaveVaultItem,
  onNotify,
  onCloseProfile,
  onSaveProfile,
  onCancelConfirm,
  folders,
  tags,
  isShareOpen,
  sharingItem,
  onCloseShare,
  isReceiveOpen,
  receivedPayload,
  onCloseReceive,
  onImportShare,
  isSharePasswordPromptOpen,
  shareReceiveError,
  onSubmitSharePassword,
  onCancelSharePasswordPrompt,
}: AppModalsProps) {
  return (
    <>
      <VaultFormModal
        isOpen={isVaultFormOpen}
        onClose={onCloseVaultForm}
        onSave={onSaveVaultItem}
        editingItem={editingItem}
        onNotify={onNotify}
        folders={folders}
        tags={tags}
      />

      <ShareModal
        isOpen={isShareOpen}
        onClose={onCloseShare}
        item={sharingItem}
      />

      <SharePasswordPrompt
        isOpen={isSharePasswordPromptOpen}
        error={shareReceiveError}
        onSubmit={onSubmitSharePassword}
        onCancel={onCancelSharePasswordPrompt}
      />

      <ReceiveShareModal
        isOpen={isReceiveOpen}
        onClose={onCloseReceive}
        payload={receivedPayload}
        onImport={onImportShare}
      />

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={onCloseProfile}
        currentAvatar={profileAvatar}
        currentName={profileName}
        onSave={onSaveProfile}
      />

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        type={confirmConfig.type}
        confirmText={confirmConfig.confirmText}
        cancelText={confirmConfig.cancelText}
        isAlert={confirmConfig.isAlert}
        onConfirm={confirmConfig.onConfirm}
        onCancel={onCancelConfirm}
      />
    </>
  );
}
