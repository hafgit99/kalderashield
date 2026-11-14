/**
 * @file scripts/lib/changelog.cjs
 * @description Reads the section of CHANGELOG.md that belongs to one version.
 *
 * The updater manifest's `notes` field is what the app shows under "What's
 * new". It used to be the generated `RELEASE_NOTES.md`, which is a packaging
 * artefact: version, platform, checksum list, warnings. Useful in an evidence
 * folder, useless as an answer to "what changed".
 *
 * CHANGELOG.md is the document that answers that question, so the manifests are
 * fed from it. The version match is tolerant on purpose: package.json carries a
 * 4-part version (7.0.25.0), tauri.conf.json a 3-part one (7.0.25), and a
 * heading may carry either, with or without a title after a dash.
 *
 * @license Apache-2.0
 */

const fs = require('fs');
const path = require('path');

/**
 * Strips the parts that do not change the meaning of a version: a leading `v`
 * and trailing `.0` segments. `7.0.25`, `v7.0.25` and `7.0.25.0` are the same
 * release.
 *
 * @param {unknown} version
 * @returns {string}
 */
function normalizeVersion(version) {
  return String(version ?? '')
    .trim()
    .replace(/^v/i, '')
    .replace(/(\.0)+$/, '');
}

/**
 * @param {string} line
 * @returns {string|null} the version in a `## <version> - title` heading
 */
function headingVersion(line) {
  const match = /^##\s+(\d+(?:\.\d+)*)(?:\s*[-\u2013\u2014].*)?$/.exec(line.trim());
  return match ? match[1] : null;
}

/**
 * Returns the body of the changelog section for `version`, or null when the
 * changelog has no such section.
 *
 * Headings inside fenced code blocks are not section boundaries -- a changelog
 * that quotes markdown would otherwise be cut in the wrong place.
 *
 * @param {unknown} version
 * @param {string} [changelogPath]
 * @returns {string|null}
 */
function readChangelogSection(version, changelogPath = path.join(__dirname, '..', '..', 'CHANGELOG.md')) {
  const wanted = normalizeVersion(version);
  if (!wanted) return null;

  let text;
  try {
    text = fs.readFileSync(changelogPath, 'utf8');
  } catch {
    return null;
  }

  const lines = text.split(/\r?\n/);
  let inFence = false;
  let start = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const found = headingVersion(line);
    if (found && normalizeVersion(found) === wanted) {
      start = index;
      break;
    }
  }

  if (start === -1) return null;

  const body = [];
  inFence = false;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && /^##\s/.test(line)) break;
    body.push(line);
  }

  const section = body.join('\n').trim();
  return section || null;
}

module.exports = { readChangelogSection, normalizeVersion };
