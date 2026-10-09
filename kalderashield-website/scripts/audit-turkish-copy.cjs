#!/usr/bin/env node
/* Flags corrupted characters in the Turkish copy.
 *
 *   node scripts/audit-turkish-copy.cjs
 *
 * ── Why a rule and not a spellchecker ─────────────────────────────────────
 *
 * The defect it exists for is not a typo, it is a substitution: "kurulum
 * särasında" for "sırasında", "görülû" for "görülür", "özetıyle" for
 * "özetiyle". No dictionary lists those, because they are not misspellings --
 * they are valid UTF-8 that decodes to letters Turkish does not have, produced
 * by a bad round trip through a Latin-1 assumption somewhere upstream. A
 * spellchecker would pass all three.
 *
 * Turkish has exactly twelve letters that carry a diacritic:
 *
 *     ç  ğ  ı  ö  ş  ü  â  î
 *
 * plus the undotted i, which makes thirteen written forms. It has no ä and no
 * û, and it uses î rather than i ("resmî"), so both of those are unambiguous.
 * That makes the rule precise instead of heuristic: two characters, one
 * language, zero ambiguity.
 *
 * ── Why Turkish only ──────────────────────────────────────────────────────
 *
 * The same test in German or Hungarian is useless -- ä and ü are ordinary
 * letters there -- and in French or Spanish it would be meaningless. This is
 * the project's primary language and the one the corruption was found in; the
 * other eleven need native review, not a Latin-1 heuristic.
 *
 * ── What it does not catch ────────────────────────────────────────────────
 *
 * Wrong-language text inside a Turkish string is a different failure and does
 * not present as an illegal character -- tr.json's feat-c1-desc contains the
 * Spanish "nativo escritorio" and passes this check. Word-level language
 * detection is not reliable enough to gate on, so that class stays a review
 * item rather than a false promise of coverage.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

/* Not ä/î/û: â ("hâlâ", "kâğıda", "dâhil", "inkâr") and î ("resmî") are correct
 * Turkish, and including them would have reported 34 of the 37 hits here as
 * false positives. That is the whole reason this list is two characters long. */
const SUSPECT = /[äû]/gi;

/* Turkish pages and the Turkish dictionary. The default locale has no directory
 * of its own -- it is the site root -- which is why index.html is named here. */
function isTurkish(rel) {
  return rel === 'assets/js/i18n/tr.json' || rel === 'index.html' || rel.startsWith('tr/');
}

const targets = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (['assets', 'node_modules', 'scripts'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.html$/.test(entry.name)) targets.push(full);
  }
})(root);
targets.push(path.join(root, 'assets', 'js', 'i18n', 'tr.json'));

const problems = [];
let scanned = 0;

for (const file of targets) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (!isTurkish(rel)) continue;
  scanned++;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    SUSPECT.lastIndex = 0;
    let m;
    while ((m = SUSPECT.exec(line)) !== null) {
      const start = Math.max(0, m.index - 45);
      const end = Math.min(line.length, m.index + 45);
      problems.push(`${rel}:${i + 1}  "${m[0]}"  …${line.slice(start, end).trim()}…`);
    }
  });
}

if (problems.length) {
  console.error(`Turkce metinde ${problems.length} yasak disi karakter:`);
  for (const p of problems) console.error('  - ' + p);
  console.error('\nBunlar Turkce alfabesinde yok. En sik neden: bir metin Latin-1');
  console.error('varsayimiyla islenmis. Harfi duzeltin ("särasında" -> "sırasında").');
  process.exit(1);
}

console.log(`PASS - ${scanned} Turkce dosyada yasak disi karakter yok.`);