/**
 * Tests for the changelog section reader.
 *
 * This reader decides what the app shows under "What's new", so a version
 * mismatch is not a cosmetic bug: it either shows nothing, or shows another
 * release's notes. The last test is the one that keeps the changelog honest --
 * a release without an entry would otherwise ship a banner with no explanation.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { normalizeVersion, readChangelogSection } from './lib/changelog.cjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const FIXTURE = `# Changelog

Intro text that belongs to no version.

## 7.0.26.0 - Update visibility (Unreleased)

### Changed

- The update check runs on every start.

## 7.0.25 - Update channels

- Windows is published in the main release.

## 7.0.18.0 - Rebrand

- Product renamed.
`;

function withChangelog(contents, assertion) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'kalderashield-changelog-'));
  const file = path.join(dir, 'CHANGELOG.md');
  writeFileSync(file, contents, 'utf8');
  try {
    assertion(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('normalizeVersion', () => {
  it('treats a 3-part, 4-part and v-prefixed version as the same release', () => {
    expect(normalizeVersion('7.0.25')).toBe('7.0.25');
    expect(normalizeVersion('7.0.25.0')).toBe('7.0.25');
    expect(normalizeVersion('v7.0.25')).toBe('7.0.25');
    expect(normalizeVersion(' 7.0.25.0 ')).toBe('7.0.25');
  });
});

describe('readChangelogSection', () => {
  it('returns the body of the matching section', () => {
    withChangelog(FIXTURE, (file) => {
      const section = readChangelogSection('7.0.26.0', file);
      expect(section).toContain('The update check runs on every start.');
      // The next version's heading must not leak into this section.
      expect(section).not.toContain('Windows is published');
    });
  });

  it('matches a 3-part heading for a 4-part version and vice versa', () => {
    withChangelog(FIXTURE, (file) => {
      expect(readChangelogSection('7.0.25.0', file)).toContain('Windows is published');
      expect(readChangelogSection('7.0.26', file)).toContain('runs on every start');
    });
  });

  it('does not treat a heading inside a code fence as a section boundary', () => {
    withChangelog(
      '## 7.0.26.0 - Quoted markdown\n\n```md\n## 7.0.25.0 - not a real heading\n```\n\n- still 7.0.26\n',
      (file) => {
        expect(readChangelogSection('7.0.26.0', file)).toContain('still 7.0.26');
      },
    );
  });

  it('returns null when the changelog has no section for the version', () => {
    withChangelog(FIXTURE, (file) => {
      expect(readChangelogSection('9.9.9', file)).toBeNull();
    });
  });

  it('returns null for a missing changelog instead of throwing', () => {
    expect(
      readChangelogSection('7.0.25', path.join(os.tmpdir(), 'does-not-exist-CHANGELOG.md')),
    ).toBeNull();
  });

  // The gate. The updater manifest publishes this section as the release notes,
  // so a version bump without a changelog entry would ship a release whose
  // "What's new" panel is empty -- or worse, the fallback packaging text.
  it('has an entry for the version in package.json', () => {
    const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    const section = readChangelogSection(packageJson.version, path.join(repoRoot, 'CHANGELOG.md'));

    expect(
      section,
      `CHANGELOG.md has no section for ${packageJson.version}; the app shows this section as the release notes.`,
    ).toBeTruthy();
  });
});
