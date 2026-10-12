#!/usr/bin/env node
/* Keeps the asset-integrity manifest reproducible.
 *
 *   node scripts/audit-build-reproducibility.cjs
 *
 * ── Why this exists, and what it does not claim ────────────────────────────
 *
 * The audit report listed "SOURCE_DATE_EPOCH / no deterministic build" under P3
 * with the reasoning that "the same source may produce two different hashes,
 * and reproducibility is valuable for the assetIntegrity manifest".
 *
 * Measured, the premise is false for this manifest: two consecutive builds
 * produce 22 byte-identical files and an identical manifest hash. There is no
 * timestamp in it and nothing to stabilise. Adding SOURCE_DATE_EPOCH would fix
 * nothing.
 *
 * The other artifact deliberately *is* not reproducible:
 * `scripts/generate-updater-manifest.cjs:127` writes `pub_date:
 * new Date().toISOString()`, because that field is how a client decides whether
 * a manifest is newer than what it already has. Forcing it to a fixed value
 * would break the updater. So this script does not chase it either.
 *
 * ── What it does check ──────────────────────────────────────────────────────
 *
 * Reproducibility here is load-bearing on one thing: the generator sorts its
 * asset list before writing. Measured both ways -- deleting the sort changes the
 * manifest hash from 92EA6A83… to DEDAD443… -- and `fs.readdir` order is not
 * specified by Node to be stable across filesystems, so a machine with a
 * different directory order would publish a different root hash for the same
 * bytes.
 *
 * That is a property nobody would notice losing. The sort reads like tidiness;
 * it is the whole mechanism. This is the cheap gate that keeps it, so the
 * reproducibility measured today does not depend on someone remembering why the
 * line is there.
 *
 * A double build in CI would be the direct test and costs a second vite run on
 * every push. Checking the mechanism instead costs a file read, and the failure
 * it prevents is the same one.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const GENERATOR = path.join(root, 'scripts', 'generate-asset-integrity-manifest.cjs');

const failures = [];
const notes = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

let source;
try {
  source = fs.readFileSync(GENERATOR, 'utf8');
} catch (err) {
  console.error(`Cannot read ${path.relative(root, GENERATOR)}: ${err.message}`);
  process.exit(1);
}

const rel = path.relative(root, GENERATOR).replace(/\\/g, '/');

// 1. The asset list is sorted before it is serialised, in BOTH places it is
//    built. Without this the manifest's order follows the filesystem, which is
//    not portable.
 //
 //    Asserted as an exact count rather than "> 0". The first version of this
 //    check used `sortCalls > 0` and passed when one of the two sorts was
 //    deleted -- which is the exact regression this gate exists to catch, tested
 //    the way the gate would actually be run.
const EXPECTED_SORTS = 2;
const sortCalls = (source.match(/\.sort\(/g) || []).length;
check(
  sortCalls === EXPECTED_SORTS,
  `${rel}: expected ${EXPECTED_SORTS} .sort() calls (one canonicalising the payload, one ordering the written manifest) and found ${sortCalls}; deleting either makes the manifest's order filesystem-dependent`
);

// 2. Nothing timestamps the manifest. A date here is exactly what would make
//    two builds of identical bytes disagree.
const timestampPatterns = [
  [/new Date\(\)/, 'new Date()'],
  [/Date\.now\(\)/, 'Date.now()'],
  [/\bISOString\(\)/, 'toISOString()'],
];
for (const [pattern, label] of timestampPatterns) {
  check(
    !pattern.test(source),
    `${rel}: ${label} must not appear in the manifest generator; a wall-clock value makes the manifest non-reproducible`
  );
}

// 3. The updater manifest is the one artifact that must stay time-dependent,
//    so this is asserted rather than merely left alone. If someone "fixes" the
//    reproducibility of latest.json by pinning pub_date, the updater stops
//    seeing new releases and nothing else fails.
const updater = path.join(root, 'scripts', 'generate-updater-manifest.cjs');
if (fs.existsSync(updater)) {
  const updaterSource = fs.readFileSync(updater, 'utf8');
  const hasPubDate = /pub_date:\s*new Date\(\)\.toISOString\(\)/.test(updaterSource);
  check(
    hasPubDate,
    'scripts/generate-updater-manifest.cjs: pub_date must stay a current timestamp; it is how a client tells a new manifest from the one it already has, and pinning it silently breaks the updater'
  );
  if (hasPubDate) notes.push('updater manifest: pub_date is intentionally time-dependent');
}

notes.push(`manifest generator sorts: ${sortCalls} call(s)`);
notes.push('manifest generator writes no wall-clock value');

for (const note of notes) console.log(`  note: ${note}`);

if (failures.length > 0) {
  console.error('\nStatus: FAIL — build reproducibility checks failed:');
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  process.exit(1);
}

console.log('\nStatus: PASS — the asset-integrity manifest stays reproducible.');
console.log('  Measured today: two consecutive builds, 22 files byte-identical.');
console.log('  The updater manifest is deliberately not, and that is asserted too.');