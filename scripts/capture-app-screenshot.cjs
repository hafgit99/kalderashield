/* Captures the real application UI for the repository README.
 *
 * The committed screenshot had been taken before the rebrand and still showed
 * the retired AegisVault wordmark, the old sidebar labels and the old avatar in
 * the top right -- a README that documents a product nobody ships.
 *
 * A mock-up would have been the wrong fix: a rendered screenshot is the only
 * thing that cannot drift silently, because it is produced by the code rather
 * than asserted about it. This drives the actual app, creates a vault, and
 * photographs the result.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.CAPTURE_BASE || 'http://127.0.0.1:4317';
const OUT = path.resolve(__dirname, '..', 'docs', 'assets', 'app-screenshot.png');

async function main() {
  const browser = await chromium.launch({ channel: 'msedge' }).catch(() => chromium.launch());
  const context = await browser.newContext({
    /* 1920 rather than a narrower frame: at 1600 the right-hand dashboard
     * column collapses and its heading overlaps the auto-lock control, which
     * would put a layout defect on the front page of the repository. */
    viewport: { width: 1920, height: 1200 },
    deviceScaleFactor: 2,
    locale: 'en-US',
  });
  const page = await context.newPage();

  await page.goto(BASE, { waitUntil: 'networkidle' });

  /* English first. The README is in English, and a Turkish screenshot of an
   * English README is its own inconsistency.
   *
   * The control is a <select>, not a list of buttons, so it has to be driven with
   * selectOption. An earlier attempt matched on button text and silently matched
   * nothing. */
  const languageSelect = page.getByTestId('lock-language-select');
  if (await languageSelect.count()) {
    await languageSelect.selectOption('en');
    await page.waitForTimeout(800);
  }

  /* The first-run vault setup is the only gate to the UI: the lock screen's
   * primary action creates the vault. `lock.action.setup` is "Start Secure Vault"
   * in English and "Güvenli Kasayı Başlat" in Turkish, so both are accepted. */
  const createButton = page
    .getByRole('button', { name: /start secure vault|güvenli kasayı başlat/i })
    .first();
  await createButton.waitFor({ state: 'visible', timeout: 30000 });
  await createButton.click();

  /* Password fields are addressed by the test ids the lock screen already
   * exposes, which is more durable than counting input[type=password]: the count
   * changes with the confirmation field, the ids do not. */
  const primary = page.getByTestId('lock-password-input');
  if (await primary.count()) {
    await primary.fill('KalderaVault!2026');
    const confirm = page.getByTestId('lock-confirm-password-input');
    if (await confirm.count()) await confirm.fill('KalderaVault!2026');
  } else {
    const inputs = page.locator('input[type="password"]');
    for (let i = 0; i < await inputs.count(); i++) {
      await inputs.nth(i).fill('KalderaVault!2026');
    }
  }

  /* First run requires accepting the legal documents, which is exactly the
   * flow this change touched in the first place. */
  const terms = page.getByTestId('lock-terms-checkbox');
  if (await terms.count()) await terms.check().catch(() => terms.click({ force: true }));

  await page.getByTestId('lock-submit-button').click();

  /* Give the vault a moment to derive keys and paint, then photograph it. */
  await page.waitForTimeout(2500);

  /* Close the Quick Start guide. It is a first-run onboarding panel covering
   * the top third of the window; leaving it in place would mean the repository
   * shows an empty checklist instead of the vault it is documenting. It is
   * dismissible, so this is the same action a user takes. */
  const dismiss = page.getByRole('button', { name: /dismiss guide/i }).first();
  if (await dismiss.count()) {
    await dismiss.click().catch(() => {});
    await page.waitForTimeout(600);
  }

  /* An empty vault is the honest state of a freshly created one. Seeding fake
   * records would look richer but would put invented credentials into a
   * security product's README, so the empty state is what ships. */
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await page.screenshot({ path: OUT });
  console.log(`screenshot: ${OUT}`);

  await browser.close();
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});