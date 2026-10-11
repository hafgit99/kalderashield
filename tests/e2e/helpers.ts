import { expect, type Page } from '@playwright/test';

/**
 * The account secret key each setup produced, per page.
 *
 * The vault key is derived from the master password *and* the account secret
 * key (`resolveVaultCredential`, storage.ts) wherever the platform can keep
 * that key. Only the Android WebView injects the secure-storage bridge
 * (`window.KalderaShieldAndroidSecureStorage`, MainActivity.kt:150), so on
 * desktop and web `isRememberSecretKeySupported()` is false: the checkbox is
 * not rendered, setup falls back to the master password alone, and nothing
 * needs to be typed on later unlocks.
 *
 * The key is still generated and shown during setup — it is the user's
 * emergency-kit material — so it is read back here for the flows that
 * legitimately need it (exporting the kit).
 */
const accountSecretKeys = new WeakMap<Page, string>();

export async function setupVault(page: Page, masterPassword: string) {
  await page.goto('/');

  await page.getByTestId('lock-password-input').fill(masterPassword);
  await page.getByTestId('lock-confirm-password-input').fill(masterPassword);
  await expect(page.getByTestId('lock-secret-key-input')).toHaveValue(/^A3-/);
  accountSecretKeys.set(page, await page.getByTestId('lock-secret-key-input').inputValue());
  await page.getByTestId('lock-terms-checkbox').check();
  await page.getByTestId('lock-submit-button').click();

  await expect(page.getByTestId('new-vault-item-button')).toBeVisible();
}

export async function unlockVault(page: Page, masterPassword: string) {
  // Outside Android nothing was stored, so the vault opens on the master
  // password alone. Where the key IS retained (Android), it is still required.
  const accountSecretKey = accountSecretKeys.get(page);
  if (accountSecretKey && await page.getByTestId('lock-secret-key-input').count() > 0) {
    await page.getByTestId('lock-secret-key-input').fill(accountSecretKey);
  }
  await page.getByTestId('lock-password-input').fill(masterPassword);
  await page.getByTestId('lock-submit-button').click();
}

/**
 * The account secret key this page's setup produced.
 *
 * Exported for the flows that need the key typed into a form rather than into
 * the lock screen — the emergency kit download, which reads
 * `getRememberedAccountSecretKey()` first and finds nothing on desktop and web
 * for the same reason `unlockVault` does not need it either.
 */
export function getAccountSecretKey(page: Page): string | undefined {
  return accountSecretKeys.get(page);
}

export async function createLoginItem(
  page: Page,
  title: string,
  options: { username?: string; password?: string; url?: string; notes?: string } = {},
) {
  await page.getByTestId('new-vault-item-button').click();
  await page.getByTestId('vault-item-title-input').fill(title);
  await page.getByTestId('vault-item-url-input').fill(options.url ?? 'https://github.com');
  await page.getByTestId('vault-item-username-input').fill(options.username ?? 'ada-e2e');
  await page.getByTestId('vault-item-password-input').fill(options.password ?? 'CorrectHorseBatteryStaple!42');
  await page.getByTestId('vault-item-notes-input').fill(options.notes ?? 'Created by the Playwright smoke suite.');
  await page.getByTestId('vault-item-save-button').click();

  const savedItem = page.getByTestId('vault-list-item').filter({ hasText: title });
  await expect(savedItem).toBeVisible();
  await expect(savedItem).toContainText(options.username ?? 'ada-e2e');

  return savedItem;
}

export async function openSettings(page: Page) {
  await page.getByTestId('nav-settings-button').click();
  await expect(page.getByTestId('plain-export-button')).toBeVisible();
}

export async function exportEncryptedBackup(page: Page) {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('encrypted-export-button').click();
  const download = await downloadPromise;
  const downloadPath = await download.path();

  expect(download.suggestedFilename()).toMatch(/^KalderaShield_guvenli_yedek_\d{4}-\d{2}-\d{2}\.KalderaShield$/);
  expect(downloadPath).toBeTruthy();

  return downloadPath!;
}
