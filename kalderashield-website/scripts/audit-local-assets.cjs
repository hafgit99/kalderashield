#!/usr/bin/env node
/* Reports markup that points at a file the site tree does not contain.
 *
 *   node scripts/audit-local-assets.cjs             report + baseline delta
 *   node scripts/audit-local-assets.cjs --strict    fail if anything is missing
 *   node scripts/audit-local-assets.cjs --write-baseline
 *
 * ── What it closes ──────────────────────────────────────────────────────────
 *
 * `.gitignore` keeps the promo video's rendered assets out of the repository,
 * and the comment explaining that says why, and then says the thing that made
 * the arrangement unsafe:
 *
 *   "Committing the markup without assets would leave every locale homepage
 *    pointing at a 12 MB file that is not in the repository, and NO GATE LOOKS
 *    AT SRC ATTRIBUTES, so it would fail silently."
 *
 * The homepages were being published from a working tree that git never saw, so
 * every other gate -- the dictionary audits, the contrast audit, the
 * reproducibility check that ends in `git diff --exit-code` -- passed on markup
 * whose <source> resolved to nothing in any checkout. The failure mode is not a
 * red build. It is a 404 that only a visitor with a browser would ever see.
 *
 * The video block was pulled from all twelve homepages at some point without
 * being removed from production: the 12 MB file and the twelve subtitle tracks
 * are still served from kalderashield.com, and the block that referenced them
 * is not in the repository. Nothing in CI noticed either half.
 *
 * So this checks the one direction nothing checked: every locally-rooted src,
 * href and srcset in the markup must resolve to a file in this tree. That is
 * also what makes the ignore rules defensible -- they keep the bytes out of
 * git, and this keeps the reference from becoming a lie.
 *
 * ── What it deliberately does not check ─────────────────────────────────────
 *
 * URLs that leave the site (https:, //cdn, mailto:, tel:) and pure fragments.
 * A remote asset is somebody else's availability question; this is about what
 * this tree claims to contain.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['assets', 'node_modules', 'scripts', '.sandbox', 'promo-video']);

/* Attributes that must resolve. `srcset` needs splitting; the rest are single
 * URLs. `href` is included because a link to a missing page is the same class
 * of failure as a missing image, and `audit-locale-links.cjs` only checks that
 * links stay inside their own language -- not that the target exists. */
const URL_ATTRS = ['src', 'href', 'poster', 'data-src'];

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

/* Deliberately a scanner, not a parser. The thing being checked is "does this
 * string name a file that exists", and a regex over attributes answers exactly
 * that without silently agreeing with however the HTML happens to nest. */
function extractReferences(html) {
  const refs = [];
  const tagRe = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g;
  let tag;
  while ((tag = tagRe.exec(html)) !== null) {
    const attrs = tag[2];
    for (const attr of URL_ATTRS) {
      const re = new RegExp(`\\b${attr}\\s*=\\s*"([^"]*)"`, 'gi');
      let m;
      while ((m = re.exec(attrs)) !== null) {
        if (m[1].trim()) refs.push({ tag: tag[1].toLowerCase(), attr, value: m[1].trim() });
      }
    }
    const srcset = /\bsrcset\s*=\s*"([^"]*)"/gi;
    let s;
    while ((s = srcset.exec(attrs)) !== null) {
      for (const part of s[1].split(',')) {
        const url = part.trim().split(/\s+/)[0];
        if (url) refs.push({ tag: tag[1].toLowerCase(), attr: 'srcset', value: url });
      }
    }
  }
  return refs;
}

function isExternal(value) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value);
}

/* A locale page's absolute URLs are site-absolute, so they resolve against the
 * site root regardless of the page's own directory. That is the whole reason
 * the generated locales can carry /assets/... unchanged. */
function resolve(pageFile, value) {
  let decoded;
  try {
    decoded = decodeURIComponent(value.split('#')[0].split('?')[0]);
  } catch {
    return null; // a malformed escape is not a path
  }
  if (!decoded) return null;

  let full;
  if (decoded.startsWith('/')) {
    full = path.join(root, decoded);
  } else {
    full = path.resolve(path.dirname(pageFile), decoded);
  }

  if (decoded.endsWith('/')) full = path.join(full, 'index.html');

  if (!fs.existsSync(full)) return null;
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    const index = path.join(full, 'index.html');
    return fs.existsSync(index) ? index : null;
  }
  return full;
}

const missing = new Map();
let checked = 0;

for (const page of pages) {
  const rel = path.relative(root, page).replace(/\\/g, '/');
  const html = fs.readFileSync(page, 'utf8');
  for (const ref of extractReferences(html)) {
    if (isExternal(ref.value)) continue;
    checked += 1;
    if (resolve(page, ref.value)) continue;
    if (!missing.has(ref.value)) missing.set(ref.value, []);
    missing.get(ref.value).push(rel);
  }
}

console.log(`HTML sayfa: ${pages.length}`);
console.log(`Yerel referans denetlenen: ${checked}`);
console.log(`Cozulemeyen: ${missing.size}`);

const entries = [...missing.entries()].sort((a, b) => b[1].length - a[1].length);
if (entries.length) {
  console.log('\n--- Cozulemeyen yerel referanslar ---');
  for (const [value, users] of entries) {
    console.log(`  ${value}`);
    console.log(`      ${users.length} sayfa · ornek: ${users[0]}`);
  }
}

const BASELINE = path.join(root, 'assets', 'local-asset-baseline.json');

function readBaseline() {
  if (!fs.existsSync(BASELINE)) return null;
  return JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
}

const args = process.argv.slice(2);

if (args.includes('--write-baseline')) {
  fs.writeFileSync(
    BASELINE,
    JSON.stringify({ generatedBy: 'scripts/audit-local-assets.cjs', refs: entries.map(([v]) => v).sort() }, null, 2) + '\n',
    'utf8',
  );
  console.log(`\nTaban yazildi: ${entries.length} referans -> ${path.relative(root, BASELINE)}`);
  process.exit(0);
}

if (args.includes('--strict')) {
  if (entries.length) {
    console.error(`\n${entries.length} yerel referans cozulemiyor.`);
    console.error('Ya dosyayi agaca koyun, ya markup\'i duzeltin.');
    process.exit(1);
  }
  console.log('\nDurum: PASS - cozulemeyen referans yok.');
  process.exit(0);
}

const baseline = readBaseline();
if (baseline === null) {
  console.log(`\nDurum: raporlandi - ${entries.length} referans. Taban dosyasi yok,`);
  console.log('       bu yuzden henuz engel degil. --write-baseline ile olusturun.');
  process.exit(0);
}

const known = new Set(baseline.refs);
const present = new Set(entries.map(([v]) => v));
const added = entries.map(([v]) => v).filter((v) => !known.has(v));
const resolved = baseline.refs.filter((v) => !present.has(v));

if (resolved.length) {
  console.log(`\nTaban listesinden cikan ${resolved.length} referans:`);
  for (const v of resolved) console.log(`  - ${v}`);
  console.log('Bunlar artik cozuluyor ya da silinmis. Taban dosyasini');
  console.log('guncelleyin: node scripts/audit-local-assets.cjs --write-baseline');
}

if (added.length) {
  console.error(`\nYeni ve cozulemeyen referans: ${added.length}`);
  for (const v of added) {
    const users = missing.get(v);
    console.error(`  - ${v}  (${users.length} sayfa · ornek: ${users[0]})`);
  }
  console.error('\nMarkup bir dosyayi isaret ediyor ama o dosya agacta yok.');
  console.error('Ziyaretci 404 gorur ve hicbir kapı bunu yakalamaz.');
  process.exit(1);
}

console.log(`\nDurum: PASS - yeni cozulemeyen referans yok (${entries.length} eski referans tabanda).`);