/* Proves check-placeholders.cjs fails on each defect it claims to catch.
 *
 * The gate is the only thing standing between a config change and a site that
 * publishes a canonical URL nobody serves, so each check is broken on purpose
 * here and the gate has to notice. A gate nobody has seen fail is not a gate.
 *
 *   node scripts/test-check-placeholders.cjs
 *
 * Every file it touches is restored from the bytes read at the start, and the
 * restoration is verified afterwards -- the audit-i18n test suite warns about
 * exactly this failure mode, where a test leaves the tree broken and the next
 * run reports findings that are its own.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const gate = path.join(root, 'scripts', 'check-placeholders.cjs');

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, text) => fs.writeFileSync(path.join(root, rel), text, 'utf8');

function gateResult() {
  try {
    const out = execFileSync('node', [gate], { cwd: root, stdio: 'pipe' });
    return { pass: true, out: out.toString() };
  } catch (err) {
    return { pass: false, out: (err.stdout || '').toString() + (err.stderr || '').toString() };
  }
}

/* Every mutation is expressed as a function so the original text is never
 * reconstructed by inverting an edit, which is where such a script usually
 * corrupts the file it meant to test. */
const cases = [
  {
    name: '{{DOMAIN}} left unfilled in a page',
    file: 'index.html',
    break: (t) => t.replace(ORIGIN + '/', '{{DOMAIN}}/'),
  },
  {
    name: 'canonical pointing at a host the site does not serve',
    file: 'index.html',
    break: (t) => t.replace(ORIGIN + '/', 'https://kalderashield.com.evil.example/'),
  },
  {
    name: 'sitemap address reverted to a token',
    file: 'robots.txt',
    break: (t) => t.replace(ORIGIN, '{{DOMAIN}}'),
  },
  {
    name: 'installer URL reverted to a token',
    file: 'install.sh',
    break: (t) => t.replace(ORIGIN, '{{DOMAIN}}'),
  },
  {
    name: 'security contact reverted to a token',
    file: '.well-known/security.txt',
    break: (t) => t.replace('security@kalderashield.com', 'security@{{DOMAIN}}'),
  },
  {
    name: 'privacy contact missing from the Turkish copy',
    file: 'assets/js/i18n/tr.json',
    break: (t) => t.split('admin@kalderashield.com').join('admin@{{DOMAIN}}'),
  },
  {
    name: 'privacy contact missing from the Japanese copy',
    file: 'assets/js/i18n/ja.json',
    break: (t) => t.split('admin@kalderashield.com').join('admin@{{DOMAIN}}'),
  },
  {
    name: 'a rebrand remnant left in published output',
    file: 'index.html',
    break: (t) => t.replace('KalderaShield', 'AegisVault'),
  },
  {
    name: 'robots.txt removed entirely',
    file: 'robots.txt',
    remove: true,
  },
];

const ORIGIN = 'https://kalderashield.com';

const originals = new Map();
for (const c of cases) {
  if (c.remove) continue;
  if (!originals.has(c.file)) originals.set(c.file, read(c.file));
}

let failures = 0;

console.log('the unmodified tree must pass:');
const clean = gateResult();
if (!clean.pass) {
  failures++;
  console.log('  FAIL', clean.out.trim().split('\n').slice(0, 4).join('\n       '));
} else {
  console.log('  ok   gate passes');
}

for (const c of cases) {
  if (c.remove) {
    const target = path.join(root, c.file);
    const saved = fs.readFileSync(target);
    fs.unlinkSync(target);
    const r = gateResult();
    fs.writeFileSync(target, saved);
    const restored = fs.readFileSync(target).equals(saved);
    const ok = !r.pass && restored;
    if (!ok) failures++;
    console.log(`${ok ? '  ok  ' : '  FAIL'} caught: ${c.name}${restored ? '' : ' (AND DID NOT RESTORE)'}`);
    continue;
  }

  const original = originals.get(c.file);
  write(c.file, c.break(original));
  const r = gateResult();
  write(c.file, original);

  const restored = read(c.file) === original;
  const ok = !r.pass && restored;
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} caught: ${c.name}${restored ? '' : ' (AND DID NOT RESTORE)'}`);
}

/* The restoration check above is only meaningful if the tree is genuinely back
 * to where it started, so verify that rather than trusting the writes. */
console.log('\nafter every case, the tree must be unchanged:');
let dirty = 0;
for (const [file, original] of originals) {
  if (read(file) === original) continue;
  dirty++;
  console.log(`  FAIL ${file} was not restored`);
}
if (!dirty && gateResult().pass) {
  console.log('  ok   every file restored and the gate passes again');
} else {
  failures++;
}

if (failures) {
  console.error(`\n${failures} problem(s): the gate is not doing what it claims.`);
  process.exit(1);
}
console.log('\nPASS: every check fires, and every file is restored.');