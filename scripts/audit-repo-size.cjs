#!/usr/bin/env node
/* Keeps large binaries out of the repository.
 *
 *   node scripts/audit-repo-size.cjs
 *
 * ── What it checks, and why it is not a `du` ────────────────────────────────
 *
 * This is a gate on what git tracks *now*. It says nothing about history, and
 * that limit is the whole reason it is worth reading rather than skipping.
 *
 * A .gitignore line prevents the next commit. It does nothing about the bytes
 * already in the object database, which is how a 12MB promo video ends up
 * costing 12MB forever after the file is removed from the working tree.
 *
 * ── What was measured, so the thresholds are not arbitrary ──────────────────
 *
 *   tracked, over 1MB            1 file
 *   largest tracked file         assets/KalderaShield-app-icon-true.png, 1.61MB
 *   largest generated icon       src-tauri/icons/icon.icns, 489KB
 *   largest icon the app uses    icons/128x128@2x.png, 36KB (256x256)
 *   .git/ today                  82.1MB, of which 38.4MB unreachable
 *   largest unreachable blob     kalderashield-promo.mp4, 11.68MB
 *
 * The repository does not have a large-asset problem. The one big tracked file
 * is a 1024x1024 master that apply-icon.cjs generates the whole icon set from
 * and verify-icons.cjs checks the result against; it is a source, not waste,
 * and deleting or downscaling it would trade a real asset for a smaller repo.
 * The 12MB video is already ignored, which is the correct outcome for a
 * publishable media file that does not belong in source control.
 *
 * So there is no pile to clear here, and a gate that fails on day one is a gate
 * people learn to bypass. These thresholds sit above today's largest file on
 * purpose. What they stop is the specific, likely next step: somebody adds a
 * screen recording or an .ai/.sketch source to a commit.
 *
 * ── Why the extension list is a separate failure ────────────────────────────
 *
 * The size budget alone would wave through a 1.9MB .mp4, and 1.9MB of video is
 * still the wrong thing to have in a git blob: it defeats clone times and
 * `git bisect` for everyone, forever, and unlike the icon it is not a source
 * anything generates from. These formats have no business being tracked here.
 * If one ever genuinely does, it belongs in .gitattributes with git-lfs, and
 * the message says so.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

/* Above the largest tracked file today (1.61MB) with room for the icon master
 * to be re-encoded, and far below anything that makes cloning unpleasant. */
const MAX_TRACKED_BYTES = 2 * 1024 * 1024;

/* Formats that should never be tracked. Not a size question. */
const FORBIDDEN_EXTENSIONS = new Set([
  '.mp4', '.mov', '.avi', '.mkv', '.webm',
  '.psd', '.ai', '.sketch', '.fig',
  '.zip', '.7z', '.tar', '.gz', '.dmg', '.iso', '.pkg',
  '.exe', '.msi', '.appimage', '.deb', '.rpm',
  '.keystore', '.jks', '.p12', '.pfx',
]);

const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const failures = [];
const notes = [];

let tracked;
try {
  tracked = git('ls-files', '-z').split('\0').filter(Boolean);
  } catch (_err) {
  console.error('git ls-files failed -- run this inside the repository.');
  process.exit(1);
}

const oversized = [];
const forbidden = [];

for (const rel of tracked) {
  const abs = path.join(root, rel);
  let size;
  try {
    size = fs.statSync(abs).size;
  } catch {
    /* A tracked path that does not exist on disk is a different problem, and
     * check-index has opinions about it. Not this gate's. */
    continue;
  }

  if (size > MAX_TRACKED_BYTES) {
    oversized.push({ rel, size });
  }

  if (FORBIDDEN_EXTENSIONS.has(path.extname(rel).toLowerCase())) {
    forbidden.push({ rel, size });
  }
}

oversized.sort((a, b) => b.size - a.size);
forbidden.sort((a, b) => b.size - a.size);

if (forbidden.length > 0) {
  for (const { rel, size } of forbidden) {
    failures.push(
      `${rel} (${(size / 1024 / 1024).toFixed(2)}MB) is a ${path.extname(rel)} file. Do not track ${path
        .extname(rel)
        .slice(1)
        .toUpperCase()} in this repository; ignore it, or if it truly belongs in the tree, put it in .gitattributes with git-lfs.`
    );
  }
}

if (oversized.length > 0) {
  for (const { rel, size } of oversized) {
    failures.push(
      `${rel} is ${(size / 1024 / 1024).toFixed(2)}MB, over the ${(MAX_TRACKED_BYTES / 1024 / 1024).toFixed(
        0
      )}MB budget for a tracked file. If it is generated, generate it in CI instead of committing it.`
    );
  }
}

notes.push(`tracked files checked: ${tracked.length}`);
notes.push(`budget per tracked file: ${(MAX_TRACKED_BYTES / 1024 / 1024).toFixed(0)}MB`);
notes.push(`format blacklist: ${FORBIDDEN_EXTENSIONS.size} extensions`);

for (const note of notes) console.log(`  note: ${note}`);

if (failures.length > 0) {
  console.error('\nStatus: FAIL -- oversized or forbidden tracked files:');
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  console.error(
    '\nNote: this gate sees the working tree only. Removing a file from git does not\n' +
      'return the space -- the blob stays in history. Reclaiming it means rewriting\n' +
      'history, which every clone and fork has to agree to, so it is not something\n' +
      'to do inside a commit. `git count-objects -vH` shows how much is loose.'
  );
  process.exit(1);
}

console.log('\nStatus: PASS -- no oversized or forbidden tracked files.');
console.log('  Today: 1 file over 1MB, the 1024x1024 icon master the icon set is built from.');
console.log('  The 12MB promo video is ignored, which is correct for publishable media.');