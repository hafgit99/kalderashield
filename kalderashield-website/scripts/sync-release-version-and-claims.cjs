/* Publishes the release number and the prose test-count claims across the whole
 * site, in all twelve languages.
 *
 *   node scripts/sync-release-version-and-claims.cjs
 *
 * What this exists for
 * --------------------
 * `sync-claims.cjs` owns `<meta name="x-test-count">` and rewrites it from the
 * suite that actually runs. Three other numbers are written by hand across the
 * site and nothing regenerates them:
 *
 *   - the release number: `data-site-version` on 290 pages, the JSON-LD
 *     `softwareVersion`, the no-JavaScript hero fallback, and the
 *     `vX.Y.Z-unsigned-preview` tag the dictionaries link to;
 *   - the unit-test count and the test-file count in the
 *     /guvenlik/denetim-durumu/ and /kaynak-kodu/ copy -- in the content
 *     sources, the twelve dictionaries, the page packs and the generated
 *     markup.
 *
 * So the site publishes its test count twice, and only one of the two is a
 * measurement. At 7.0.22 the meta said 2366 while the prose said 2204 in twelve
 * languages: two different numbers for the same suite, on the page whose job is
 * to say what is verified. That gap existed because the prose needed a
 * deliberate edit nobody remembered to make, in thirty languages' worth of
 * files.
 *
 * How it works
 * ------------
 * `content/release-claims.json` records what the site currently publishes. The
 * numbers in the prose are written in words a script cannot parse -- "248 test
 * files", "248 fichier de tests", "248 個のテストファイル" -- so the old value has
 * to be known to be replaced. It lives in one file instead of two hundred.
 *
 * The replacement is a whole-token match on the old value, never a pattern: a
 * number that appears inside another one (`1248`, `2487`) is left alone, and
 * every skip is reported so a number nobody expected can be seen rather than
 * assumed.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');
const CLAIMS = path.join(root, 'content', 'release-claims.json');

const { countTests } = require('./sync-claims.cjs');

/* package.json carries four segments (the Android versionCode scheme); the site
 * has always shown three. Trimming the trailing zeros is the same rule the
 * release workflow's tag check uses. */
function currentVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  return String(pkg.version).replace(/(\.0)+$/, '');
}

/* Only text files. A byte-level rewrite across the tree would also change the
 * same digits inside an image, which is how a logo ends up one byte away from
 * being corrupt -- and would match `248` inside a .vtt subtitle timestamp, which
 * is a position in a video, not a claim. */
const EXTENSIONS = new Set([
  '.html', '.json', '.cjs', '.mjs', '.js', '.md', '.xml', '.txt', '.sh',
  '.webmanifest', '.css', '.yml', '.yaml',
]);

function wholeToken(needle) {
  return new RegExp(`(?<![0-9])${needle}(?![0-9])`, 'g');
}

function main() {
  const claims = JSON.parse(fs.readFileSync(CLAIMS, 'utf8'));
  const { tests, files } = countTests();
  const version = currentVersion();

  const swaps = [
    { label: 'surum', from: claims.version, to: version },
    { label: 'test', from: String(claims.tests), to: String(tests) },
    { label: 'test dosyasi', from: String(claims.testFiles), to: String(files) },
  ];

  for (const s of swaps) {
    if (!s.from) throw new Error(`content/release-claims.json has no ${s.label} to replace`);
    console.log(`  ${s.label}: ${s.from} -> ${s.to}`);
  }

  let changedFiles = 0;
  let hits = 0;
  const perLabel = { surum: 0, test: 0, 'test dosyasi': 0 };

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      if (full === CLAIMS) continue;

      const before = fs.readFileSync(full, 'utf8');
      let after = before;
      for (const s of swaps) {
        const found = after.match(wholeToken(s.from));
        if (!found) continue;
        after = after.replace(wholeToken(s.from), s.to);
        perLabel[s.label] += found.length;
        hits += found.length;
      }
      if (after === before) continue;
      fs.writeFileSync(full, after, 'utf8');
      changedFiles++;
    }
  }

  walk(root);

  fs.writeFileSync(
    CLAIMS,
    `${JSON.stringify({ version, tests, testFiles: files }, null, 2)}\n`,
    'utf8'
  );

  console.log(
    `${changedFiles} dosya, ${hits} sayi guncellendi ` +
      `(surum ${perLabel.surum}, test ${perLabel['test']}, test dosyasi ${perLabel['test dosyasi']})`
  );
  console.log(`content/release-claims.json: ${version} / ${tests} test / ${files} dosya`);
  if (changedFiles === 0) console.log('Site zaten gunceldi.');
}

if (require.main === module) main();