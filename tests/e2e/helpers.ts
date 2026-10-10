import { expect, type Page } from '@playwright/test';

/**
 * The account secret key each setup produced, per page.
 *
 * The vault key is derived from the master password *and* the account secret
 * key (`resolveVaultCredential`, storage.ts), and setup marks the key as
 * required for every later unlock. The "remember on this device" checkbox
 * cannot help here: `rememberAccountSecretKey` stores the key through
 * `window.KalderaShieldAndroidSecureStorage`, which only the Android WebView
 * injects (MainActivity.kt:150). In a browser -- including this suite's --
 * that store is unavailable, so the checkbox is accepted and nothing is kept.
 *
 * So the user has to type the key again on every unlock, and the suite has to
 * as well. Keeping it per page is what a real user does with a printed
 * emergency kit; pretending the checkbox worked would make these tests cover a
 * flow no browser user ever gets.
 */
const accountSecretKeys = new WeakMap<Page, string>();

export async function setupVault(page: Page, masterPassword: string) {
  await page.goto('/');

  await page.getByTestId('lock-password-input').fill(masterPassword);
  await page.getByTestId('lock-confirm-password-input').fill(masterPassword);
  await expect(page.getByTestId('lock-secret-key-input')).toHaveValue(/^A3-/);
  accountSecretKeys.set(page, await page.getByTestId('lock-secret-key-input').inputValue());
  await page.getByTestId('lock-terms-checkbox').check();
  await page.getByTestId('lock-remember-secret-key-checkbox').check();
  await page.getByTestId('lock-submit-button').click();

  await expect(page.getByTestId('new-vault-item-button')).toBeVisible();
}

export async function unlockVault(page: Page, masterPassword: string) {
  const accountSecretKey = accountSecretKeys.get(page);
  if (accountSecretKey) {
    await page.getByTestId('lock-secret-key-input').fill(accountSecretKey);
  }
  await page.getByTestId('lock-password-input').fill(masterPassword);
  await page.getByTestId('lock-submit-button').click();
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
