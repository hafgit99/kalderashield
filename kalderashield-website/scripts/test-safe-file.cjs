/* Proves `lib/safe-file.cjs` does not shorten or corrupt what it rewrites.
 *
 *   node scripts/test-safe-file.cjs
 *
 * The failure this covers is not hypothetical. The descriptor is positioned at
 * the end of the file after reading it, so writing without truncating first and
 * without an explicit position leaves the tail of the old content sitting after
 * the new content. For a JSON file the result still parses — JSON stops at the
 * first closing brace — so a dictionary quietly loses every key that came after
 * the edit point, and the i18n audit reports the loss as an ordinary translation
 * gap somewhere else entirely. For a page it leaves a closing tag twice.
 *
 * Three cases, because they fail differently: shrinking a file, a file written
 * at the same length, and a no-op that must not touch the bytes at all.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const { updateFile, updateJsonFile } = require('./lib/safe-file.cjs');

let failures = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ok   ${label}`);
    return;
  }
  failures++;
  console.error(`  FAIL ${label}\n       beklenen: ${expected}\n       gelen:    ${actual}`);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-safe-json-'));

try {
  // 1. Shrinking: the old content is longer than the new one. This is the case
  //    that leaves a dangling tail if the truncate is missing.
  const long = path.join(dir, 'long.json');
  fs.writeFileSync(long, `${JSON.stringify({ a: 'x'.repeat(500), b: 1, c: 2 }, null, 2)}\n`, 'utf8');

  const wrote = updateJsonFile(long, (dict) => {
    dict.a = 'short';
    return dict;
  });

  check('kisa icerik yazildi', wrote, true);
  check('dosya kisaldi', fs.statSync(long).size < 250, true);

  const reparsed = JSON.parse(fs.readFileSync(long, 'utf8'));
  check('a degisti', reparsed.a, 'short');
  check('b korundu', reparsed.b, 1);
  check('c korundu', reparsed.c, 2);
  check('son satir sonuk bosluk', fs.readFileSync(long, 'utf8').endsWith('}\n'), true);

  // 2. Returning nothing leaves the file byte-identical, so a script that runs
  //    twice on a repo that is already up to date does not show a diff.
  const before = fs.readFileSync(long);
  check('degisiklik yoksa yazmaz', updateJsonFile(long, () => undefined), false);
  check('dosya bit bit ayni', Buffer.compare(before, fs.readFileSync(long)), 0);

  // 3. Same-length rewrite: no truncate needed, but the write must still land
  //    at the start of the file rather than after what was read.
  const same = path.join(dir, 'same.json');
  fs.writeFileSync(same, `${JSON.stringify({ k: 'aaaa' }, null, 2)}\n`, 'utf8');
  updateJsonFile(same, (dict) => {
    dict.k = 'bbbb';
    return dict;
  });
  check('ayni uzunlukta dogru yazildi', JSON.parse(fs.readFileSync(same, 'utf8')).k, 'bbbb');

  // 4. The HTML case, which is what the page edits go through. The marker in
  //    the middle of the file is what a missing truncate would leave behind.
  const page = path.join(dir, 'page.html');
  fs.writeFileSync(page, '<html><body><a href="/old.html">x</a><!-- KEEP ME --></body></html>\n', 'utf8');
  const wrotePage = updateFile(page, (html) => html.replace('/old.html', '/new.html'));
  check('sayfa yazildi', wrotePage, true);
  const rewritten = fs.readFileSync(page, 'utf8');
  check('sayfada yeni yol', rewritten.includes('/new.html'), true);
  check('sayfada kalan icerik korundu', rewritten.includes('<!-- KEEP ME -->'), true);
  check('sayfada tek kapanis etiketi', (rewritten.match(/<\/body>/g) || []).length, 1);
  check('degisiklik yoksa yazmaz (metin)', updateFile(page, (html) => html), false);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`\n${failures} kontrol basarisiz.`);
  process.exit(1);
}
console.log('\nsafe-file: tum kontroller gecti.');