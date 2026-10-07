/* Temporary check for stray Latin fragments inside the non-Latin translations.
 *
 *   node scripts/tmp-check-policy-strays.cjs
 *
 * Scoped to the five non-Latin locales on purpose. An earlier version scanned all
 * twelve and reported 2500 findings, every one of them a Turkish or German word,
 * because Latin *is* the script those six locales are written in. The check is
 * only meaningful where Latin is foreign.
 *
 * The reason it exists at all: a machine-generated translation of this page picked
 * up English words in the middle of Japanese and Arabic sentences, and nothing
 * else in the tree would have complained. audit-i18n.cjs checks writing system,
 * key parity and markup set, and an embedded Latin clause passes all three --
 * the sentence still contains plenty of the expected script. Only reading it shows
 * the problem.
 *
 * Tokens that are genuinely Latin in these values are listed below: product and
 * service names, file names, the SignPath role names the policy has to quote, and
 * technical vocabulary the existing dictionaries already leave in English.
 */
const fs = require('fs');
const path = require('path');

const FILE = 'apply-signpath-policy-i18n-nonlatin.cjs';
const NON_LATIN = ['ru', 'ar', 'ja', 'ko', 'zh'];

const ALLOWED = new Set([
  // markup
  'strong', 'em', 'p', 'ul', 'li', 'a', 'code', 'span',
  'rel', 'noopener', 'noreferrer', 'href', 'mailto', 'https', 'http',
  // products, services, roles the policy must quote verbatim
  'Windows', 'Android', 'Linux', 'macOS', 'Apple', 'Developer', 'Store',
  'Authenticode', 'SignPath', 'Foundation', 'KalderaShield', 'GitHub', 'Actions',
  'Approver', 'Approvers', 'Authors', 'Reviewers',
  // artifact and file vocabulary
  'AppImage', 'MSI', 'NSIS', 'SBOM', 'Sigstore', 'keystore', 'notarize',
  'SHA', 'SUMS', 'json', 'sigstore', 'yml', 'txt', 'sig', 'rpm', 'deb',
  'exe', 'msi', 'setup', 'portable', 'x64', 'fail', 'closed',
  'push', 'commit', 'action', 'support',
  // fail-closed reaches the matcher with its trailing hyphen attached, and with
  // a capital in the Russian sentence where it starts the clause.
  'fail-closed', 'Fail-closed-',
  // repository paths and file names, split at the hyphen the matcher sees
  'LICENSE-', 'RD-PARTY', 'CODE', 'SIGNING', 'POLICY', 'SECURITY',
  'guvenlik', 'denetim', 'durumu', 'security', 'signpath', 'github',
  'hafgit', 'kalderashield', 'blob', 'main', 'md', 'html', 'io', 'org', 'com',
]);

const text = fs.readFileSync(path.resolve(__dirname, FILE), 'utf8');
let findings = 0;

text.split('\n').forEach((line, index) => {
  const m = line.match(/^ {4}(ru|ar|ja|ko|zh): '/);
  if (!m) return;

  // Strip the places Latin is correct before looking for the places it is not.
  // The mailto: rule deliberately leaves the local part in, so support@ stays
  // visible as "support" rather than silently disappearing -- the address is
  // Latin by definition and is allowed below.
  const stripped = line
    .replace(/https?:\/\/[^'"]*/g, '')
    .replace(/<code>[^<]*<\/code>/g, '')
    .replace(/href="[^"]*"/g, '');

  for (const run of stripped.match(/[A-Za-z][A-Za-z-]{3,}/g) || []) {
    if (ALLOWED.has(run)) continue;
    findings++;
    console.log(`${FILE}:${index + 1} [${m[1]}] stray Latin: ${JSON.stringify(run)}`);
  }
});

if (findings === 0) {
  console.log('clean: no stray Latin inside the non-Latin translations');
} else {
  console.log(`\n${findings} stray fragment(s) to fix`);
  process.exitCode = 1;
}
