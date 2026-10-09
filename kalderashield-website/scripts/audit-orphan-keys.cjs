#!/usr/bin/env node
/* Reports dictionary keys that no page renders.
 *
 *   node scripts/audit-orphan-keys.cjs            report
 *   node scripts/audit-orphan-keys.cjs --strict   fail if any orphan exists
 *
 * ── What it closes ────────────────────────────────────────────────────────
 *
 * Every other check in this directory runs dictionary-ward: audit-static-i18n
 * asks "does this page say what its dictionary says", measure-locale-coverage
 * asks "does every locale have this key". Both are blind to a key that no page
 * asks for.
 *
 * That gap is not theoretical. The twelve dictionaries carried 1416 keys and
 * the pages used 1004; the 412 nobody rendered included rec-c3-desc, which
 * described the recovery KDF as PBKDF2-SHA256 while src/lib/recoveryKey.ts
 * derives it with Argon2id, and testimonial-2, which asserted that independent
 * security audits exist when none has taken place. Both shipped to every
 * visitor's browser in the dictionary payload. Neither was visible on any page,
 * which is why no gate reported them and why they survived review.
 *
 * Two dictionaries in a language nobody reads is not the same as wrong copy on
 * a page, but it is not "correct" either: it is a claim that no build checks and
 * no reviewer sees, and it reappears the moment someone wires the section back
 * up.
 *
 * ── Why this only reports by default ─────────────────────────────────────
 *
 * An orphan is not automatically dead. It may be copy for a section that was
 * cut and is planned to return, or a shared fragment used by a page built later.
 * Failing the build on the current 412 would be a false signal on day one and
 * would train people to delete things. So the default mode prints the list and
 * counts; --strict is there for the commit that actually prunes or adopts them.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const I18N = path.join(root, 'assets', 'js', 'i18n');
const BASE = 'en';
const SKIP_DIRS = new Set(['assets', 'node_modules', 'scripts', '.sandbox']);

/* Some keys are produced at runtime and therefore never appear as a literal
 * data-i18n="..." in the markup. build-chrome-dictionary.cjs extracts them by
 * name, and i18n-apply.js substitutes them into the text it is given, so they
 * have no node to find them on. Listing them is what keeps this report honest
 * about its own coverage: a key that is live but unlisted reads as dead. */
const RUNTIME_KEYS = [
  'promo-video-label',
  'video-play-btn-label',
  'video-privacy-note',
  'video-eyebrow',
  'video-title',
  'video-desc',
  'cookie-title',
  'cookie-desc',
  'cookie-btn-accept',
  'cookie-btn-save',
  'cookie-opt-essential-title',
  'cookie-opt-essential-desc',
  'cookie-opt-analytics-title',
  'cookie-opt-analytics-desc',
  'cookie-opt-marketing-title',
  'cookie-opt-marketing-desc',
  'cookie-opt-disabled',
  'cookie-opt-always-active',
  'donate-network-label',
  'donate-copy-btn',
  'donate-copied-btn',
  'donate-warning-title',
  'donate-warning-desc',
  'donate-transparency-title',
  'donate-transparency-desc',
  'donate-quick-copy',
  'modal-addr-label',
  'modal-copy-hint',
  'lightbox-hint',
  'mockup-hint',
  'snap-img-hint',
  'skip-link',
  'back-to-home',
];

const pages = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) pages.push(full);
  }
})(root);

const used = new Map();
for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file).replace(/\\/g, '/');
  for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) {
    if (!used.has(m[1])) used.set(m[1], rel);
  }
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of m[1].split(',')) {
      const name = pair.split(':')[1];
      if (name && name.trim() && !used.has(name.trim())) used.set(name.trim(), rel);
    }
  }
}

const dicts = {};
for (const file of fs.readdirSync(I18N)) {
  // The baseline lives beside the dictionaries and is not one. Loading it as
  // locale "" produced a parity failure against every key it records.
  if (!file.endsWith('.json') || file.startsWith('.')) continue;
  dicts[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(path.join(I18N, file), 'utf8'));
}

const base = dicts[BASE];
if (!base) throw new Error(`${BASE}.json not found in ${I18N}`);

const runtime = new Set(RUNTIME_KEYS);
const orphans = Object.keys(base).filter((k) => !used.has(k) && !runtime.has(k));
const runtimeMissing = RUNTIME_KEYS.filter((k) => !(k in base));

/* A key rendered by a page but absent from en.json is the opposite failure and
 * just as silent: i18n-apply.js leaves the element as authored, so the page
 * shows whatever the markup said, in whatever language the page is. */
const missing = [...used.keys()].filter((k) => !(k in base));

/* Parity first. An orphan list computed from a dictionary whose siblings are
 * missing is not worth printing, because "en has a key ru does not" and "no page
 * uses it" are different problems and the second is downstream of the first. */
const parity = [];
for (const [locale, dict] of Object.entries(dicts)) {
  for (const key of Object.keys(base)) {
    if (!(key in dict)) parity.push(`${locale}.json eksik: ${key}`);
  }
  for (const key of Object.keys(dict)) {
    if (!(key in base)) parity.push(`${locale}.json fazla: ${key}`);
  }
}

console.log(`HTML sayfa: ${pages.length}`);
console.log(`en.json anahtar: ${Object.keys(base).length}`);
console.log(`Sayfada kullanilan: ${used.size}`);
console.log(`Calisma zamani uretilen (beyaz liste): ${RUNTIME_KEYS.length}`);
console.log(`Kullanilmayan (orphan): ${orphans.length}`);

if (parity.length) {
  console.error(`\nAnahtar uyumsuzlugu: ${parity.length}`);
  for (const p of parity.slice(0, 20)) console.error('  - ' + p);
  process.exit(1);
}
if (missing.length) {
  console.error(`\nSayfada kullanilan ama en.json'da olmayan anahtar: ${missing.length}`);
  for (const k of missing.slice(0, 20)) console.error(`  - ${k}  (${used.get(k)})`);
  process.exit(1);
}
if (runtimeMissing.length) {
  console.error(`\nBeyaz listede ama en.json'da olmayan anahtar: ${runtimeMissing.join(', ')}`);
  console.error('Beyaz liste geride kalmis; ya anahtari kaldirin ya da burada tutun.');
  process.exit(1);
}

if (orphans.length) {
  console.log('\n--- Kullanilmayan anahtarlar ---');
  for (const key of orphans) {
    console.log(`  ${key.padEnd(26)} ${String(base[key]).slice(0, 78)}`);
  }
}

/* Grouped by prefix, because "381 keys" is not a decision anybody can act on
 * and "the snapshot section, 21 keys" is. The prefixes are section names rather
 * than namespaces -- this dictionary predates a naming convention -- so they
 * read as an inventory of what the site stopped showing. */
const groups = new Map();
for (const key of orphans) {
  const prefix = key.split('-')[0];
  if (!groups.has(prefix)) groups.set(prefix, []);
  groups.get(prefix).push(key);
}
if (groups.size) {
  console.log('\n--- On ekine gore ---');
  for (const [prefix, keys] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(prefix).padEnd(16)} ${String(keys.length).padStart(3)}  ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''}`);
  }
}

/* ── The delta gate ────────────────────────────────────────────────────────
 *
 * Failing on 381 orphans the moment this script is added would be a false
 * signal on day one, and a gate people learn to bypass is worse than no gate.
 * Legacy orphans are therefore recorded in a committed baseline and the check
 * fails only on orphans the baseline does not contain -- so the debt stops
 * growing today, and pruning it becomes ordinary work rather than a migration
 * hidden inside an unrelated commit.
 *
 * Regenerate the baseline only when orphans are deliberately adopted or removed:
 *   node scripts/audit-orphan-keys.cjs --write-baseline
 *
 * A key moves out of the baseline when it gains a data-i18n node, which is the
 * point: adopting copy into a real section is a visible act.
 */
/* Beside the dictionaries and not among them.
 *
 * Everything in assets/js/i18n/ is a locale by contract -- measure-locale-coverage.cjs
 * says so at the top of its own file, after audit-i18n read a config file
 * sitting there as a thirteenth locale and reported every key missing from
 * "locales". The first version of this script put the baseline in that folder
 * and reproduceexactly that: build-chrome-dictionary.cjs then treated
 * `.orphan-baseline` as a dictionary named after a file. assets/ is where
 * locales.json already lives for the same reason. */
const BASELINE = path.join(root, 'assets', 'i18n-orphan-baseline.json');

function readBaseline() {
  if (!fs.existsSync(BASELINE)) return null;
  return JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
}

const baseline = readBaseline();

if (process.argv.includes('--write-baseline')) {
  fs.writeFileSync(
    BASELINE,
    JSON.stringify({ generatedFrom: BASE, keys: orphans.slice().sort() }, null, 2) + '\n',
    'utf8'
  );
  console.log(`\nTaban yazildi: ${orphans.length} orphan -> ${path.relative(root, BASELINE)}`);
  process.exit(0);
}

const strict = process.argv.includes('--strict');
if (strict && orphans.length) {
  console.error(`\n${orphans.length} anahtar hicbir sayfada kullanilmiyor.`);
  console.error('Ya sayfaya baglayin, ya silin.');
  process.exit(1);
}

if (baseline === null) {
  console.log(`\nDurum: raporlandi - ${orphans.length} orphan. Taban dosyasi yok,`);
  console.log('       bu yuzden henuz engel degil. --write-baseline ile olusturun.');
} else {
  const known = new Set(baseline.keys);
  const added = orphans.filter((k) => !known.has(k));
  const resolved = baseline.keys.filter((k) => !orphans.includes(k));

  if (resolved.length) {
    console.log(`\nTaban listesinden cikan ${resolved.length} anahtar:`);
    for (const k of resolved.slice(0, 20)) console.log(`  - ${k}`);
    console.log('Bunlar artik kullaniliyor ya da silinmis. Taban dosyasini');
    console.log('guncelleyin: node scripts/audit-orphan-keys.cjs --write-baseline');
  }

  if (added.length) {
    console.error(`\nYeni ve kullanilmayan anahtar: ${added.length}`);
    for (const k of added) console.error(`  - ${k}  = ${String(base[k]).slice(0, 80)}`);
    console.error('\nBu anahtarlar hicbir sayfada gorunmuyor. Uc secenek var:');
    console.error('  1) Sayfaya data-i18n dugumu ekleyin.');
    console.error('  2) Sozlukten silin.');
    console.error('  3) Bilerek tuttugunuzu --write-baseline ile tabana isaretleyin.');
    console.error('Sessizce birakmak, denetlenmeyen bir iddiayi tasimak demektir.');
    process.exit(1);
  }

  console.log(`\nDurum: PASS - yeni orphan yok (${orphans.length} eski orphan tabanda).`);
}