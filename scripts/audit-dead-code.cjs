#!/usr/bin/env node
/* Reports code that nothing reaches, and fails when the pile grows.
 *
 *   node scripts/audit-dead-code.cjs             report + baseline delta
 *   node scripts/audit-dead-code.cjs --strict    fail if anything at all is dead
 *   node scripts/audit-dead-code.cjs --write-baseline
 *
 * ── What it closes ──────────────────────────────────────────────────────────
 *
 * The audit report's P2-5 counted unused exports by hand and got 164; the real
 * number depends entirely on what you count as "used", and the hand count
 * included exports that only their own test file touches. A sanitizer with 47
 * passing tests and no caller anywhere in src/ scores as healthy under a
 * naive count. That is the same failure the report already documents twice --
 * hook tests green while nothing renders the hook -- and it needs a tool rather
 * than another careful read.
 *
 * So this runs knip for the module graph, and adds one check knip cannot do.
 *
 * ── The blind spot knip has, and why it matters here ────────────────────────
 *
 * Knip treats test files as entry points. A module imported *only by its own
 * test* therefore looks alive, which is how these two survived:
 *
 *   src/lib/notes.ts
 *     47 passing tests over sanitizeNoteText / validateNoteSecurity /
 *     MAX_NOTE_LENGTH, and not one production caller. Every note in the vault
 *     reaches storage with nothing but a `.trim()`.
 *
 *   src/lib/sync/attachmentSyncEngine.ts
 *     4 passing tests, zero callers, not re-exported from the sync barrel --
 *     and provably broken if anyone did wire it: it uploads the attachment
 *     payload through `provider.uploadVault`, hijacking the vault blob slot
 *     with `checksum: ''`, and hardcodes `downloaded: 0` so attachments can
 *     never arrive.
 *
 * Both are reported here under `test-only` rather than under knip's categories,
 * and both are real findings that a "green tests" reading would have missed.
 *
 * ── Scope, and what is deliberately not here ────────────────────────────────
 *
 * exports, types, files, duplicates. Dependency and binary analysis is
 * excluded: this repo drives tools through config files and CSS (stryker's
 * .mjs configs, tailwind through @tailwindcss/vite, playwright through npm
 * scripts), so knip's dependency findings are mostly "knip cannot read this"
 * dressed as findings. Those deserve their own check, not a baseline entry
 * nobody reads.
 *
 * ── Why this only fails on the delta by default ─────────────────────────────
 *
 * Same reasoning as audit-orphan-keys.cjs: failing on the current pile on day
 * one is a false signal, and a gate people learn to bypass is worse than no
 * gate. The debt stops growing today; clearing it becomes ordinary work
 * instead of a migration hidden in an unrelated commit.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const BASELINE = path.join(root, 'scripts', 'dead-code-baseline.json');

/* Knip's own categories, minus the ones scoped out above. */
const INCLUDE = ['exports', 'types', 'files', 'duplicates'];

/* ── 1. Knip ────────────────────────────────────────────────────────────────── */

/* Spawned as `node <knip bin>` rather than `npx knip`: `npx` is a `.cmd` shim
 * on Windows and `spawnSync` will not find it without `shell: true`, which
 * would mean interpolating this script's own path into a command line. */
function runKnip() {
  /* knip's package.json "exports" map refuses both `knip` and `knip/package.json`,
 * so neither require.resolve subpath works. node_modules/knip/bin/knip.js is
 * the declared bin entry and npm installs it flat; the existence check below is
 * what turns a missing or relocated knip into a readable message instead of a
 * MODULE_NOT_FOUND from inside a gate. */
  const bin = path.join(root, 'node_modules', 'knip', 'bin', 'knip.js');
  if (!fs.existsSync(bin)) {
    console.error(`knip bulunamadi: ${path.relative(root, bin)}`);
    console.error('Dev bagimliliklari kurun: npm ci');
    process.exit(1);
  }
  const args = [
    bin,
    '--reporter',
    'json',
    '--no-progress',
    '--include',
    INCLUDE.join(','),
  ];
  let stdout;
  try {
    stdout = execFileSync(process.execPath, args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (err) {
    // knip exits non-zero when it finds issues even with a reporter, and the
    // report still lands on stdout. Only a missing report is a real failure.
    if (err.stdout) stdout = err.stdout;
    else throw err;
  }
  return JSON.parse(stdout);
}

/* ── 2. Test-only modules ───────────────────────────────────────────────────── */

/* A module is "test-only" when every file that imports it is a test file, and
 * at least one of those is its own test. That second clause is what keeps a
 * helper used only by sibling tests out of the report: shared test utilities
 * are a legitimate pattern.
 *
 * This is a textual scan, not a resolver. It reads import specifiers and
 * resolves them to paths, which is enough for this repo's own relative imports
 * and deliberately does not attempt to follow barrels or aliases.
 */
function listSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
const BARE_IMPORT_RE = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;
/* `import('./x')` has no `from`, so the two patterns above miss it entirely.
 * That is not a rare shape here: src/main.tsx lazily loads the whole app with
 * `import('./App.tsx')`, and without this the gate reported App.tsx as
 * test-only dead code. */
const DYNAMIC_IMPORT_RE = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function collectImports(file) {
  const source = fs.readFileSync(file, 'utf8');
  const specs = new Set();
  for (const re of [IMPORT_RE, BARE_IMPORT_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(source)) !== null) specs.add(match[1]);
  }
  return specs;
}

function findTestOnlyModules() {
  const files = listSourceFiles(path.join(root, 'src'));
  const rel = (file) => path.relative(root, file).replace(/\\/g, '/');
  const isTest = (file) => /\.(test|spec)\.(ts|tsx)$/.test(file);

  /** @type {Map<string, string[]>} module -> importing files */
  const importers = new Map();
  for (const file of files) {
    for (const spec of collectImports(file)) {
      const resolved = resolveSpecifier(file, spec);
      if (!resolved) continue;
      const list = importers.get(resolved) ?? [];
      list.push(file);
      importers.set(resolved, list);
    }
  }

  const testOnly = [];
  for (const file of files) {
    if (isTest(file)) continue;
    const consumers = importers.get(file) ?? [];
    if (consumers.length === 0) continue;
    if (!consumers.every(isTest)) continue;
    // Both sides of this comparison have to be repo-relative; the first version
    // built the prefix from the absolute path and matched nothing, which is how
    // the gate reported zero dead code on a repo that had two.
    const ownTest = rel(file).replace(/\.tsx?$/, '.test');
    if (!consumers.some((c) => rel(c).startsWith(ownTest))) continue;
    testOnly.push({
      file: rel(file),
      consumers: consumers.map(rel).sort(),
    });
  }
  return testOnly.sort((a, b) => a.file.localeCompare(b.file));
}

/* ── 3. Flatten to stable keys ──────────────────────────────────────────────── */

/* Line numbers are deliberately not part of a key: inserting a line above an
 * unused export would otherwise rewrite the baseline on every unrelated edit.
 * file + symbol is what a reviewer acts on. */
function flattenKnip(report) {
  const found = [];
  for (const issue of report.issues ?? []) {
    for (const [kind, entries] of [
      ['file', issue.files],
      ['export', issue.exports],
      ['type', issue.types],
      ['duplicate', issue.duplicates],
    ]) {
      for (const entry of entries ?? []) {
        const name = Array.isArray(entry) ? entry.map((e) => e.name).join('|') : entry.name;
        found.push({ kind, file: issue.file, symbol: name });
      }
    }
  }
  return found;
}

const key = (item) => `${item.kind}:${item.file}:${item.symbol ?? ''}`;

/* ── 4. Report and gate ─────────────────────────────────────────────────────── */

const knipIssues = flattenKnip(runKnip());
const testOnly = findTestOnlyModules();
const current = [...knipIssues.map((i) => ({ ...i, kind: i.kind })), ...testOnly.map((m) => ({ kind: 'test-only', file: m.file, symbol: '' }))];

const byKind = new Map();
for (const item of current) byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);

console.log(`knip (${INCLUDE.join(', ')}): ${knipIssues.length}`);
console.log(`test-only modules:            ${testOnly.length}`);
for (const [kind, count] of [...byKind.entries()].sort()) console.log(`  ${kind.padEnd(12)} ${count}`);

if (testOnly.length) {
  console.log('\n--- Yalnizca kendi testi tarafindan import edilen ---');
  for (const mod of testOnly) {
    console.log(`  ${mod.file}`);
    console.log(`      ${mod.consumers.join(', ')}`);
  }
}

if (current.length) {
  console.log('\n--- Olu kod ---');
  for (const item of current.sort((a, b) => key(a).localeCompare(key(b)))) {
    console.log(`  ${item.kind.padEnd(10)} ${item.file}${item.symbol ? ` -> ${item.symbol}` : ''}`);
  }
}

function readBaseline() {
  if (!fs.existsSync(BASELINE)) return null;
  return JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
}

const args = process.argv.slice(2);

if (args.includes('--write-baseline')) {
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      { generatedBy: 'scripts/audit-dead-code.cjs', entries: current.map(key).sort() },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  console.log(`\nTaban yazildi: ${current.length} kayit -> ${path.relative(root, BASELINE)}`);
  process.exit(0);
}

if (args.includes('--strict')) {
  if (current.length) {
    console.error(`\n${current.length} kayit hicbir yerden erisilemiyor.`);
    console.error('Ya silin, ya gercek bir cagiran bulun.');
    process.exit(1);
  }
  console.log('\nDurum: PASS - olu kod yok.');
  process.exit(0);
}

const baseline = readBaseline();

if (baseline === null) {
  console.log(`\nDurum: raporlandi - ${current.length} kayit. Taban dosyasi yok,`);
  console.log('       bu yuzden henuz engel degil. --write-baseline ile olusturun.');
  process.exit(0);
}

const known = new Set(baseline.entries);
const present = new Set(current.map(key));
const added = current.map(key).filter((k) => !known.has(k));
const resolved = baseline.entries.filter((k) => !present.has(k));

if (resolved.length) {
  console.log(`\nTaban listesinden cikan ${resolved.length} kayit:`);
  for (const k of resolved) console.log(`  - ${k}`);
  console.log('Bunlar artik kullaniliyor ya da silinmis. Taban dosyasini');
  console.log('guncelleyin: node scripts/audit-dead-code.cjs --write-baseline');
}

if (added.length) {
  console.error(`\nYeni ve erisilemeyen kayit: ${added.length}`);
  for (const k of added) console.error(`  - ${k}`);
  console.error('\nUc secenek var:');
  console.error('  1) Gercek bir cagiran bulun ya da yazin.');
  console.error('  2) Sileyin.');
  console.error('  3) Bilerek tuttugunuzu --write-baseline ile tabana isaretleyin.');
  process.exit(1);
}

console.log(`\nDurum: PASS - yeni olu kod yok (${current.length} eski kayit tabanda).`);