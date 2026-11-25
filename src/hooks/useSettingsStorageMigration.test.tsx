/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key, language: 'en' }),
}));

vi.mock('../lib/storage', () => ({
  migrateActiveVaultStorageToWaSqlite: vi.fn(),
}));

vi.mock('../lib/desktopStorage', () => ({
  isAndroidRuntime: vi.fn(() => false),
  isDesktopRuntime: vi.fn(() => false),
}));

import { useSettingsStorageMigration } from './useSettingsStorageMigration';
import { migrateActiveVaultStorageToWaSqlite } from '../lib/storage';
import { isAndroidRuntime, isDesktopRuntime } from '../lib/desktopStorage';

describe('useSettingsStorageMigration', () => {
  const onDatabaseChanged = vi.fn();
  const onNotify = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAndroidRuntime).mockReturnValue(false);
    vi.mocked(isDesktopRuntime).mockReturnValue(false);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('blocks migration on Android runtime', async () => {
    vi.mocked(isAndroidRuntime).mockReturnValue(true);

    const { result } = renderHook(() =>
      useSettingsStorageMigration({ onDatabaseChanged, onNotify }),
    );

    await act(async () => {
      await result.current.handleWaSqliteMigration();
    });

    expect(result.current.storageMigrationStatus).toBe('error');
    expect(result.current.storageMigrationMessage).toContain('androidUnsupported');
  });

  it('blocks migration on Desktop runtime where native storage is authoritative', async () => {
    vi.mocked(isDesktopRuntime).mockReturnValue(true);

    const { result } = renderHook(() =>
      useSettingsStorageMigration({ onDatabaseChanged, onNotify }),
    );

    await act(async () => {
      await result.current.handleWaSqliteMigration();
    });

    expect(result.current.storageMigrationStatus).toBe('error');
    expect(result.current.storageMigrationMessage).toContain('desktopUnsupported');
    expect(migrateActiveVaultStorageToWaSqlite).not.toHaveBeenCalled();
  });

  it('does nothing when user cancels confirm dialog', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const { result } = renderHook(() =>
      useSettingsStorageMigration({ onDatabaseChanged, onNotify }),
    );

    await act(async () => {
      await result.current.handleWaSqliteMigration();
    });

    expect(result.current.storageMigrationStatus).toBe('idle');
    expect(migrateActiveVaultStorageToWaSqlite).not.toHaveBeenCalled();
  });

  it('sets promoted status on successful migration', async () => {
    vi.mocked(migrateActiveVaultStorageToWaSqlite).mockResolvedValue({ status: 'promoted' } as any);

    const { result } = renderHook(() =>
      useSettingsStorageMigration({ onDatabaseChanged, onNotify }),
    );

    await act(async () => {
      await result.current.handleWaSqliteMigration();
    });

    expect(result.current.storageMigrationStatus).toBe('promoted');
    expect(onDatabaseChanged).toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalled();
  });

  it('sets blocked status with issue preview on dry-run failure', async () => {
    vi.mocked(migrateActiveVaultStorageToWaSqlite).mockResolvedValue({
      status: 'blocked',
      issues: ['issue-1', 'issue-2'],
    } as any);

    const { result } = renderHook(() =>
      useSettingsStorageMigration({ onDatabaseChanged, onNotify }),
    );

    await act(async () => {
      await result.current.handleWaSqliteMigration();
    });

    expect(result.current.storageMigrationStatus).toBe('blocked');
    expect(result.current.storageMigrationMessage).toContain('issue-1');
  });

  it('sets blocked status without issue preview when issues are empty', async () => {
    vi.mocked(migrateActiveVaultStorageToWaSqlite).mockResolvedValue({
      status: 'blocked',
      issues: [],
    } as any);

    const { result } = renderHook(() =>
      useSettingsStorageMigration({ onDatabaseChanged, onNotify }),
    );

    await act(async () => {
      await result.current.handleWaSqliteMigration();
    });

    expect(result.current.storageMigrationStatus).toBe('blocked');
    expect(result.current.storageMigrationMessage).toBe('settings.storageMigration.blocked');
  });

  it('maps session-required and android-wasm errors to specific messages', async () => {
    vi.mocked(migrateActiveVaultStorageToWaSqlite).mockRejectedValueOnce(
      new Error('vault-storage-active-migration-session-required'),
    );

    const { result } = renderHook(() =>
      useSettingsStorageMigration({ onDatabaseChanged, onNotify }),
    );

    await act(async () => {
      await result.current.handleWaSqliteMigration();
    });

    expect(result.current.storageMigrationStatus).toBe('error');
    expect(result.current.storageMigrationMessage).toContain('missingSession');

    vi.mocked(migrateActiveVaultStorageToWaSqlite).mockRejectedValueOnce(
      new Error('wa-sqlite-android-webview-wasm-memory-unsupported'),
    );

    await act(async () => {
      await result.current.handleWaSqliteMigration();
    });

    expect(result.current.storageMigrationMessage).toContain('androidUnsupported');

    vi.mocked(migrateActiveVaultStorageToWaSqlite).mockRejectedValueOnce(
      new Error('wa-sqlite-desktop-native-storage-preferred'),
    );

    await act(async () => {
      await result.current.handleWaSqliteMigration();
    });

    expect(result.current.storageMigrationMessage).toContain('desktopUnsupported');
  });

  it('shows generic error for unexpected failures', async () => {
    vi.mocked(migrateActiveVaultStorageToWaSqlite).mockRejectedValueOnce(
      new Error('unknown crash'),
    );

    const { result } = renderHook(() =>
      useSettingsStorageMigration({ onDatabaseChanged, onNotify }),
    );

    await act(async () => {
      await result.current.handleWaSqliteMigration();
    });

    expect(result.current.storageMigrationStatus).toBe('error');
    expect(result.current.storageMigrationMessage).toContain('unknown crash');
  });
});
