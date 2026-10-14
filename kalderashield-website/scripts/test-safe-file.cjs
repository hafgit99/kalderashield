/* Proves `lib/safe-file.cjs` does not shorten or corrupt what it rewrites.
 *
 *   node scripts/test-safe-file.cjs
 *
 * The failure this covers is not hypothetical. The descriptor is positioned at
 * the end of the file after reading it, so writing without truncating first and
 * without an explicit position leaves the tail of the old content sitting after
 * the new content. For a JSON file the result still parses -- JSON stops at the
 * first closing brace -- so a dictionary quietly loses every key that came after
 * the edit point, and the i18n audit reports the loss as an ordinary translation
 * gap somewhere else entirely. For a page it leaves a closing tag twice.
 *
 * Four cases, because they fail differently: shrinking a file, a file written at
 * the same length, a page, and a no-op that must not touch the bytes at all.
 *
 * Every access here goes through a descriptor, including the reads that verify
 * the result. `statSync` followed by `readFileSync` on the same name is the
 * check-then-use shape CodeQL reports as `js/file-system-race` (CWE-367), and
 * the first version of this test was flagged for it: it verified the write by
 * looking the file up again by name. The module under test exists because of
 * that rule, so the test that proves the module has to obey it too.
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

/** Read a file through a descriptor, the same way the module under test does. */
function readAll(file) {
  const fd = fs.openSync(file, 'r');
  try {
    return fs.readFileSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** Create a fixture through a descriptor rather than by name. */
function writeNew(file, text) {
  const fd = fs.openSync(file, 'w');
  try {
    fs.writeSync(fd, text, 0, 'utf8');
  } finally {
    fs.closeSync(fd);
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-safe-file-'));

try {
  // 1. Shrinking: the old content is longer than the new one. This is the case
  //    that leaves a dangling tail if the truncate is missing.
  const long = path.join(dir, 'long.json');
  writeNew(long, `${JSON.stringify({ a: 'x'.repeat(500), b: 1, c: 2 }, null, 2)}\n`);

  const wrote = updateJsonFile(long, (dict) => {
    dict.a = 'short';
    return dict;
  });

  check('kisa icerik yazildi', wrote, true);

  const reparsed = JSON.parse(readAll(long).toString('utf8'));
  check('a degisti', reparsed.a, 'short');
  check('b korundu', reparsed.b, 1);
  check('c korundu', reparsed.c, 2);
  check('dosya gercekten kisaldi', readAll(long).length < 250, true);
  check('son satir sonuk bosluk', readAll(long).toString('utf8').endsWith('}\n'), true);

  // 2. Returning nothing leaves the file byte-identical, so a script that runs
  //    twice on a repo that is already up to date does not show a diff.
  const before = readAll(long);
  check('degisiklik yoksa yazmaz', updateJsonFile(long, () => undefined), false);
  check('dosya bit bit ayni', Buffer.compare(before, readAll(long)), 0);

  // 3. Same-length rewrite: no truncate needed, but the write must still land
  //    at the start of the file rather than after what was read.
  const same = path.join(dir, 'same.json');
  writeNew(same, `${JSON.stringify({ k: 'aaaa' }, null, 2)}\n`);
  updateJsonFile(same, (dict) => {
    dict.k = 'bbbb';
    return dict;
  });
  check('ayni uzunlukta dogru yazildi', JSON.parse(readAll(same).toString('utf8')).k, 'bbbb');

  // 4. The HTML case, which is what the page edits go through. The marker in
  //    the middle of the file is what a missing truncate would leave behind.
  const page = path.join(dir, 'page.html');
  writeNew(page, '<html><body><a href="/old.html">x</a><!-- KEEP ME --></body></html>\n');
  const wrotePage = updateFile(page, (html) => html.replace('/old.html', '/new.html'));
  check('sayfa yazildi', wrotePage, true);

  const rewritten = readAll(page).toString('utf8');
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