#!/usr/bin/env node
/* Prepares the unsigned Windows preview for manual upload to GitHub Releases.
 *
 *   npm run windows:preview:package
 *
 * Why a local script and not a workflow
 * -------------------------------------
 * SignPath's terms require a Windows release to exist before an application can
 * be made, so one has to be published. The obvious way is a workflow with
 * `contents: write`, and that is exactly what
 * scripts/security-release-signing-gate.cjs is built to prevent: a second route
 * from an unsigned build to a published artifact, which is the thing policy Y-19
 * exists to close. Adding one as an "exception" would mean the guarantee the gate
 * reports -- "without the signing secrets, a public desktop release remains
 * impossible by design" -- stops being true, and the exception would have to be
 * added deliberately rather than by an assistant noticing a failing check.
 *
 * So the build stays where the gate already permits it to be:
 * `.github/workflows/build-windows-unsigned.yml` builds on GitHub's runner with
 * `contents: read` and uploads to Actions artifacts, which it provably cannot
 * publish. This script runs on the maintainer's machine, takes those artifacts,
 * and prints exactly what to type into the GitHub Releases form. The judgment
 * about publishing stays a human one, made in a browser, with the gate untouched.
 *
 * It also produces the SHA256SUMS.txt the release notes tell users to check.
 * That file is not optional: the notes promise it, and a user who is told to
 * verify a hash that is not published has been told to do something impossible.
 *
 * What it does NOT do: create, edit or delete anything on GitHub. It writes into
 * a local staging directory and stops.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const STAGE = path.join(root, 'release-preview', 'windows');

/* An explicit version argument means "release these bytes as they are". The tag is
 * then derived from the artifacts rather than from package.json, so the release
 * name and the bytes inside it cannot disagree. */
const OVERRIDE = process.argv[3] && /^\d+\.\d+\.\d+(\.\d+)?$/.test(process.argv[3]) ? process.argv[3] : null;

const MANIFEST = (() => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const m = String(pkg.version || '').match(/^(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
})();

if (!MANIFEST) {
  console.error('Could not read a dotted version from package.json.');
  process.exit(1);
}

const VERSION = OVERRIDE || MANIFEST;
const TAG = `v${VERSION}-unsigned-preview`;

const INPUT = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, 'release-local', 'windows');

if (!fs.existsSync(INPUT)) {
  console.error(`No Windows artifacts at ${INPUT}.`);
  console.error('');
  console.error('Two ways to get them:');
  console.error('');
  console.error('  1. From CI, which is the preferred route:');
  console.error('     Actions -> "Windows unsigned build" -> Run workflow.');
  console.error('     Download the "kalderashield-windows-unsigned" artifact,');
  console.error('     unpack it, and pass that folder here.');
  console.error('');
  console.error('  2. Locally:');
  console.error('     npm run release:local:skip-tests');
  console.error('     then pass release-local/windows.');
  process.exit(1);
}

/* Only these are uploaded. Everything else under the build directory -- the
 * evidence folder, the signing report, intermediate JSON -- is internal and has
 * no business on a public release page. */
const PUBLISHABLE = /\.(exe|msi|blockmap|sig)$/i;
const INTERNAL = /^DESKTOP_SIGNATURES\.md$/i;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const all = walk(INPUT);
const binaries = all.filter(
  (f) => /\.(exe|msi)$/i.test(f) && !INTERNAL.test(path.basename(f))
);
const extras = all.filter((f) => PUBLISHABLE.test(f) && !binaries.includes(f));

if (binaries.length === 0) {
  console.error(`No .exe or .msi found under ${INPUT}.`);
  console.error(`Found ${all.length} file(s); first few:`);
  all.slice(0, 8).forEach((f) => console.error('  ' + path.relative(INPUT, f)));
  process.exit(1);
}

/* ------------------------------------------------- version agreement check -- */

/**
 * Every artifact must carry the version being released.
 *
 * This check exists because it is the failure that would actually happen. The
 * build directory is not emptied between versions: local-release.cjs does its own
 * cleanup, but a build that half-failed, or one run from a checkout on an older
 * tag, leaves the previous version's installers sitting there next to the new
 * ones. A release tagged v7.0.20 carrying 7.0.19 installers is worse than no
 * release at all -- it claims a provenance the bytes do not have, and the SHA-256
 * manifest would happily checksum them, which makes it look verified.
 *
 * The version is read from each filename rather than trusted from the directory
 * name, so a stale file cannot hide behind a folder that was renamed.
 */
const NAME_VERSION = /(\d+\.\d+\.\d+(?:\.\d+)?)/;
const found = new Map();

for (const file of binaries) {
  const m = path.basename(file).match(NAME_VERSION);
  if (!m) {
    console.error(`Cannot read a version from the filename: ${path.basename(file)}`);
    process.exit(1);
  }
  if (!found.has(m[1])) found.set(m[1], []);
  found.get(m[1]).push(path.basename(file));
}

const expected = VERSION;
const mismatched = [...found.keys()].filter((v) => v !== expected);

if (mismatched.length > 0) {
  console.error('REFUSING TO STAGE: the artifacts are not the version being released.');
  console.error('');
  console.error(`  package.json version : ${expected}`);
  console.error(`  release tag would be : ${TAG}`);
  console.error('');
  for (const [v, files] of found) {
    const mark = v === expected ? 'ok  ' : 'DIFF';
    console.error(`  [${mark}] ${v}`);
    files.forEach((f) => console.error(`           ${f}`));
  }
  console.error('');
  console.error('A stale build directory is the usual cause. Clean it and rebuild:');
  console.error('');
  console.error('  Remove-Item -Recurse -Force release-local');
  console.error('  npm run release:local:skip-tests');
  console.error('');
  console.error('Or, if you genuinely mean to release the older version, pass it');
  console.error('explicitly so the tag is derived from the bytes rather than the');
  console.error('package manifest:');
  console.error('');
  console.error(`  npm run windows:preview:package -- ${mismatched.join(' ')}`);
  process.exit(1);
}

if (binaries.length < 3) {
  console.error(`Only ${binaries.length} Windows binary artifact(s) found.`);
  console.error('Expected the installer, the MSI and the portable executable.');
  console.error('Publishing a partial set means a user who wants the MSI finds');
  console.error('nothing. Refusing rather than publishing half a release.');
  process.exit(1);
}

/* ---------------------------------------------------------------- staging -- */

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const rows = [];
for (const file of [...binaries, ...extras]) {
  const base = path.basename(file);
  const dest = path.join(STAGE, base);
  fs.copyFileSync(file, dest);
  rows.push({ base, digest: sha256(dest), size: fs.statSync(dest).size });
}

/* Sorted, so the manifest is stable across runs and a reader diffing two of them
 * sees only a real change. */
rows.sort((a, b) => a.base.localeCompare(b.base));

const sums = rows.map((r) => `${r.digest}  ${r.base}`).join('\n') + '\n';
fs.writeFileSync(path.join(STAGE, 'SHA256SUMS.txt'), sums, 'utf8');

/* ------------------------------------------------------- release note body -- */

const notes = `## ⚠️ Windows artifacts in this release are NOT code-signed

These files carry no Authenticode signature and have no download reputation.
**Windows will show "Windows protected your PC" and you must click "More info" →
"Run anyway" to run the installer.** That is expected, and it is not a sign of
malware.

Verify the SHA-256 digest against \`SHA256SUMS.txt\` before running anything:

\`\`\`
sha256sum -c SHA256SUMS.txt          # Linux / macOS
certutil -hashfile KalderaShield-${VERSION}-x64-setup.exe SHA256   # Windows
\`\`\`

**Why unsigned.** This project's release pipeline treats an unsigned desktop
release as a failure rather than shipping one, so there is nothing to sign with
yet. An application to the [SignPath Foundation](https://signpath.org) for a free
open-source code-signing certificate has been prepared but not submitted. When
signing is available, subsequent Windows releases will be signed and this notice
will be removed.

This is a **pre-release**, published so that a Windows release exists at all.
It is not a stable release, and \`latest\` does not point at it.

The code signing policy — including exactly what is and is not signed, and who
approves each signature — is published at
<https://kalderashield.com/code-signing-policy.html>.

---

## What's in this build

Windows x64 installer artifacts for v${VERSION}, built from this repository by
GitHub Actions. See the repository CHANGELOG for the full list of changes.

## Verify before installing

\`\`\`
${sums.trim()}
\`\`\`
`;

const notesPath = path.join(STAGE, 'RELEASE-NOTES.md');
fs.writeFileSync(notesPath, notes, 'utf8');

/* ------------------------------------------------------------------ report -- */

console.log('');
console.log('Staged for a MANUAL GitHub Release upload.');
console.log('');
console.log(`  folder : ${path.relative(root, STAGE)}`);
console.log(`  tag    : ${TAG}`);
console.log(`  title  : KalderaShield ${VERSION} for Windows (unsigned preview)`);
console.log('');
console.log('Upload these files:');
for (const r of rows) {
  console.log(`  ${r.base.padEnd(46)} ${(r.size / 1048576).toFixed(1)} MB`);
}
console.log('');
console.log('Then, in the GitHub Releases form:');
console.log('  1. Releases -> Draft a new release');
console.log(`  2. Choose tag: ${TAG}  (create it by typing it; do not pick "main")`);
console.log(`  3. Target: the commit you built from`);
console.log('  4. Title:  KalderaShield ' + VERSION + ' for Windows (unsigned preview)');
console.log('  5. Paste the contents of RELEASE-NOTES.md as the description');
console.log('  6. Drag every file above into the assets box');
console.log('  7. **Set "Set as a pre-release" ON.** This is the step that keeps');
console.log('     `latest` pointing at the signed releases.');
console.log('  8. Publish.');
console.log('');
console.log('After publishing, check:');
console.log(`  gh release view ${TAG} --json tagName,isPrerelease,isLatest`);
console.log('  gh release view --json tagName    # must NOT be ' + TAG);
console.log('');
console.log('The release notes are in: ' + path.relative(root, notesPath));
console.log('');
