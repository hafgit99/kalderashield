#!/usr/bin/env node
/* Catches pointers to files that are not in the repository.
 *
 *   node scripts/audit-doc-links.cjs
 *
 * ── What was measured when this was written ────────────────────────────────
 *
 *   tracked .md files scanned            41
 *   pointers to an untracked docs/*.md   2 files, 3 references
 *
 *   docs/ARCHITECTURE_REVIEW.md:9,59
 *     -> docs/SECURITY_CODE_AUDIT_REPORT_2026.md
 *   SECURITY_AUDIT_PACKAGE/APPLICATION_OSTIF_ALPHA_OMEGA.md:74
 *     -> docs/OSTIF_ALPHA_OMEGA_HAZIRLIK_PLANI.md
 *
 * Both resolved, in a browser, to nothing.
 *
 * ── Why a dead pointer here is worse than a dead pointer elsewhere ──────────
 *
 * docs/ is deliberately not tracked: the reports in it carry line numbers,
 * vulnerability detail and internal roadmaps. A tracked document pointing into
 * it produces a 404 for anyone reading the repository, which is merely untidy.
 *
 * SECURITY_AUDIT_PACKAGE/ is different. It is the evidence index handed to an
 * external assessor, and it points at docs/ the same way its sibling documents
 * do -- of which four (EXTERNAL_AUDIT_SCOPE, EXTERNAL_AUDIT_SCOPE_EN,
 * ANDROID_READINESS, RELEASE_PLAN) *are* tracked, so the reader has every reason
 * to expect the relative path to resolve. One row did not. An assessor working
 * through the table would have recorded a missing hardening plan, which is a
 * finding about this project that is not true.
 *
 * ── How the check is written, and what it deliberately misses ──────────────
 *
 * It resolves `docs/<name>.md` and `../docs/<name>.md` references only. That is
 * the class of reference that can be dead while still looking correct, because
 * the path is well-formed and the file genuinely does not exist. General
 * Markdown link checking is a larger problem and is not attempted here; a
 * half-checked link audit that ignores most links is worse than none, since it
 * reads as coverage.
 *
 * The named docs are untracked *by policy*, so the fix for a hit is never
 * "track the file" silently. Either the referencing sentence is rewritten to
 * say the document is available on request -- which is what the audit package
 * now says for both its rows -- or the document is genuinely published, which
 * is an owner's decision about disclosure.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

/* docs/<name>.md or ../docs/<name>.md, inside backticks, a markdown link, or
 * bare. Backtick form is the one this project actually writes. */
const DOC_REF_RE = /(?:\.\.\/)?docs\/([A-Za-z0-9._-]+\.md)/g;

let trackedFiles;
try {
  trackedFiles = execFileSync('git', ['ls-files', '*.md'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean);
} catch (_err) {
  console.error('git ls-files failed -- run this inside the repository.');
  process.exit(1);
}

const failures = [];
const referenced = new Set();
let scanned = 0;

for (const rel of trackedFiles) {
  const abs = path.join(root, rel);
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    continue;
  }
  scanned += 1;

  DOC_REF_RE.lastIndex = 0;
  let match;
  const seenInFile = new Set();
  while ((match = DOC_REF_RE.exec(text)) !== null) {
    const name = match[1];
    if (seenInFile.has(name)) continue;
    seenInFile.add(name);
    referenced.add(name);

    const target = path.join(root, 'docs', name);
    if (!fs.existsSync(target)) {
      const line = text.slice(0, match.index).split('\n').length;
      failures.push(
        `${rel}:${line} -> docs/${name}, which is not in the repository. Either publish it or say in the sentence that it is available on request.`
      );
      continue;
    }

    let isTracked;
    try {
      execFileSync('git', ['ls-files', '--error-unmatch', `docs/${name}`], {
        cwd: root,
        stdio: 'ignore',
      });
      isTracked = true;
    } catch {
      isTracked = false;
    }

    if (!isTracked) {
      const line = text.slice(0, match.index).split('\n').length;
      failures.push(
        `${rel}:${line} -> docs/${name} exists on disk but is not tracked, so the reference 404s for anyone reading the repository.`
      );
    }
  }
}

console.log(`  note: tracked markdown files scanned: ${scanned}`);
console.log(`  note: distinct docs/ references: ${referenced.size}`);

if (failures.length > 0) {
  console.error('\nStatus: FAIL -- tracked documents point at files nobody can open:');
  for (const failure of failures) console.error(`  FAIL ${failure}`);
  console.error('\nReports under docs/ are untracked on purpose. The fix is to rewrite the');
  console.error('reference and say the document is available on request -- not to quietly');
  console.error('publish an internal report.');
  process.exit(1);
}

console.log('\nStatus: PASS -- every docs/ reference resolves to a tracked file.');
console.log('  Scope: docs/*.md references only, by design. See the header.');