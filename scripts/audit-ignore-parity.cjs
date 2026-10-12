#!/usr/bin/env node
/* Keeps .zcodeignore in step with .gitignore.
 *
 *   node scripts/audit-ignore-parity.cjs
 *
 * ── The problem, measured ───────────────────────────────────────────────────
 *
 *   .zcodeignore   87 patterns
 *   .gitignore     71 patterns
 *
 * Eight patterns were in .gitignore and not in .zcodeignore:
 *
 *   release-preview/                     kalderashield-website/assets/video/
 *   promo-video/                         *.tmp.mjs
 *   .sandbox/                            tests/hero-*.png
 *                                        tests/viewport-*.png
 *   PROFESYONEL_YAPI_DENETIM_RAPORU.md
 *
 * Two of those are directories holding real bulk -- the 12.25MB promo video and
 * whatever release-preview/ contains. Both are deliberately excluded from
 * version control. An external tool that honours .zcodeignore and walked the
 * tree on that file's terms would descend into exactly the directories the
 * project keeps out of the repository, and would do so silently, because an
 * ignore list that is quietly incomplete produces no error.
 *
 * The two files share their first twelve lines verbatim and use the same
 * syntax, so this is one list kept twice by hand. Two hand-kept copies of one
 * list is a difference waiting to happen, and this one had already happened.
 *
 * ── Why this is one-directional ────────────────────────────────────────────
 *
 * Only .gitignore -> .zcodeignore is checked. .gitignore is the authority
 * because git is what actually enforces it: a pattern missing from .gitignore
 * is a real tracking bug, while a pattern missing from .zcodeignore only
 * affects a tool this repository does not contain and cannot test. Checking
 * the other direction would flag the 16 patterns .zcodeignore legitimately
 * carries for its own consumer, and a gate that cries wolf is a gate that gets
 * skipped.
 *
 * Comments and blank lines are ignored. Patterns are compared trimmed, because
 * indentation is not meaning in either file.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const GITIGNORE = path.join(root, '.gitignore');
const ZCODEIGNORE = path.join(root, '.zcodeignore');

const failures = [];

function patterns(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`Cannot read ${path.basename(file)}: ${err.message}`);
    process.exit(1);
  }
  return new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
  );
}

const authoritative = patterns(GITIGNORE);
const mirror = patterns(ZCODEIGNORE);

const missing = [...authoritative].filter((pattern) => !mirror.has(pattern)).sort();

console.log(`  note: .gitignore patterns:   ${authoritative.size}`);
console.log(`  note: .zcodeignore patterns: ${mirror.size}`);

/* Extra entries in the mirror are expected and fine -- see the header. Counted
 * so the number is visible rather than assumed. */
const extra = [...mirror].filter((pattern) => !authoritative.has(pattern));
console.log(`  note: mirror-only patterns:  ${extra.length} (allowed)`);

if (missing.length > 0) {
  for (const pattern of missing) {
    failures.push(
      `.gitignore ignores "${pattern}" but .zcodeignore does not. Anything honouring .zcodeignore will walk into it.`
    );
  }
}

if (failures.length > 0) {
  console.error('\nStatus: FAIL -- the two ignore lists have drifted:');
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  console.error('\nCopy the missing patterns across, then re-run. Do not replace the whole');
  console.error('file: .zcodeignore carries patterns of its own that .gitignore has no use for.');
  process.exit(1);
}

console.log('\nStatus: PASS -- every .gitignore pattern is present in .zcodeignore.');
console.log('  Direction is one-way on purpose; see the header for why.');