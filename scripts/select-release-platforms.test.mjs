/**
 * Tests for release platform selection.
 *
 * Runs under vitest (the scripts glob picks up *.test.mjs). This decision
 * controls what a release is allowed to ship, so it gets a real test rather
 * than living as untested inline shell in the workflow.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  readRepoReleaseConfig,
  resolveSetting,
  resolveSigningModes,
  selectReleasePlatforms,
} from './select-release-platforms.cjs';

describe('release platform selection', () => {
  it('selects every platform when the variable is unset', () => {
    // The one that must never drift. Resolving a missing variable to "build
    // nothing" would produce a green run that publishes no desktop build.
    for (const unset of [undefined, null, '', '   ']) {
      const result = selectReleasePlatforms(unset);
      expect(result.selection).toBe('linux,macos,windows');
      expect(result.macos).toBe(true);
      expect(result.windows).toBe(true);
      expect(result.requestedWasUnset).toBe(true);
    }
  });

  it('treats the literal all as every platform, in any casing or spacing', () => {
    for (const all of ['all', 'ALL', 'All', ' all ']) {
      expect(selectReleasePlatforms(all).selection).toBe('linux,macos,windows');
    }
  });

  it('can narrow to a Linux-only release', () => {
    const result = selectReleasePlatforms('linux');
    expect(result.selection).toBe('linux');
    expect(result.macos).toBe(false);
    expect(result.windows).toBe(false);
  });

  it('accepts "linux" as a token instead of reporting it as a typo', () => {
    // The assertion that distinguishes the selection from the CLI. The test
    // above passed while the real workflow failed: `selectReleasePlatforms`
    // returned the right `selection`, and the *entry point* then exited 1
    // because `linux` was not in the accepted set. So `RELEASE_DESKTOP_PLATFORMS=linux`
    // — the one documented way to ship without desktop certificates — was a dead
    // end that failed the whole release, for as long as it was documented.
    //
    // `unknown` is the field the CLI gates on, so assert on that.
    expect(selectReleasePlatforms('linux').unknown).toEqual([]);
    expect(selectReleasePlatforms('linux,macos').unknown).toEqual([]);
    // A typo must still be rejected: over-correcting into "ignore what I don't
    // recognise" would ship a partial release nobody asked for.
    expect(selectReleasePlatforms('macos,windwos').unknown).toEqual(['windwos']);
  });

  it('can select a single optional platform', () => {
    expect(selectReleasePlatforms('macos').selection).toBe('linux,macos');
    expect(selectReleasePlatforms('windows').selection).toBe('linux,windows');
  });

  it('normalises casing, spacing and duplicate entries', () => {
    const result = selectReleasePlatforms(' MACOS , windows ,macos ');
    expect(result.selection).toBe('linux,macos,windows');
    expect(result.macos).toBe(true);
    expect(result.windows).toBe(true);
  });

  it('reports an unsupported platform instead of silently ignoring it', () => {
    // The over-correction: ignoring a typo would produce a partial release that
    // nobody asked for and that still looks green.
    const result = selectReleasePlatforms('macos,windwos');
    expect(result.unknown).toEqual(['windwos']);
    expect(result.selection).toBe('linux,macos');
  });

  it('always includes Linux regardless of what was asked for', () => {
    for (const requested of ['', 'all', 'macos', 'windows', 'macos,windows']) {
      expect(selectReleasePlatforms(requested).selection).toContain('linux');
    }
  });
});

describe('release signing modes', () => {
  it('blocks a selected platform that has neither a certificate nor a declaration', () => {
    // The fail-closed default. Without this the release would either fail
    // ninety minutes into the build job (the certificate import throws) or,
    // worse, publish an unsigned artifact nobody declared.
    const result = resolveSigningModes({
      selection: 'linux,macos,windows',
      allowUnsigned: '',
      certificates: { windows: false, macos: false },
    });

    expect(result.modes.windows).toBe('blocked');
    expect(result.modes.macos).toBe('blocked');
    expect(result.unsignedPlatforms).toEqual([]);
  });

  it('publishes a declared platform unsigned when no certificate exists', () => {
    const result = resolveSigningModes({
      selection: 'linux,windows',
      allowUnsigned: 'windows',
      certificates: { windows: false, macos: false },
    });

    expect(result.modes.windows).toBe('unsigned');
    expect(result.unsignedPlatforms).toEqual(['windows']);
    // macOS was not selected, so it has no signing state to decide.
    expect(result.modes.macos).toBe('skipped');
  });

  it('never downgrades a platform that has a certificate', () => {
    // Declaring a platform unsigned must not *cause* an unsigned release. If
    // the certificate exists, the release signs.
    const result = resolveSigningModes({
      selection: 'linux,windows',
      allowUnsigned: 'windows',
      certificates: { windows: true, macos: false },
    });

    expect(result.modes.windows).toBe('signed');
    expect(result.unsignedPlatforms).toEqual([]);
  });

  it('does not let a declaration for one platform authorise another', () => {
    const result = resolveSigningModes({
      selection: 'linux,windows,macos',
      allowUnsigned: 'windows',
      certificates: { windows: false, macos: false },
    });

    expect(result.modes.windows).toBe('unsigned');
    expect(result.modes.macos).toBe('blocked');
  });

  it('rejects a declaration for a platform that cannot be unsigned', () => {
    // Linux has no OS-level signature, so declaring it unsigned is a mistake
    // in the configuration, not a mode.
    const result = resolveSigningModes({
      selection: 'linux,windows',
      allowUnsigned: 'linux,windows',
      certificates: { windows: false, macos: false },
    });

    expect(result.unknown).toEqual(['linux']);
    expect(result.modes.windows).toBe('unsigned');
  });

  it('treats an unset declaration as no declaration', () => {
    for (const allowUnsigned of [undefined, null, '', '   ', 'none']) {
      const result = resolveSigningModes({
        selection: 'linux,windows',
        allowUnsigned,
        certificates: { windows: false, macos: false },
      });
      expect(result.unsignedPlatforms).toEqual([]);
      expect(result.modes.windows).toBe('blocked');
    }
  });
});

describe('release configuration sources', () => {
  it('prefers the environment over the committed file', () => {
    // The repository variable is the operational override: it can be changed
    // for one release without a commit.
    expect(resolveSetting('windows', 'macos')).toBe('windows');
  });

  it('falls back to the committed file when the environment is empty', () => {
    // GitHub expands an unset repository variable to an empty string, so an
    // empty value has to mean "not set" rather than "override with nothing".
    expect(resolveSetting('', 'windows')).toBe('windows');
    expect(resolveSetting('   ', 'windows')).toBe('windows');
    expect(resolveSetting(undefined, 'windows')).toBe('windows');
  });

  it('resolves to nothing when neither source has a value', () => {
    expect(resolveSetting('', '')).toBeUndefined();
    expect(resolveSetting(undefined, undefined)).toBeUndefined();
  });

  it('reads the committed release configuration', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'KalderaShield-release-config-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'release-config.json'),
        JSON.stringify({ desktopPlatforms: 'windows', allowUnsignedPlatforms: 'windows' }),
      );

      const config = readRepoReleaseConfig(dir);
      expect(config.desktopPlatforms).toBe('windows');
      expect(config.allowUnsignedPlatforms).toBe('windows');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats a missing configuration file as no configuration', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'KalderaShield-release-config-'));
    try {
      expect(readRepoReleaseConfig(dir)).toEqual({});
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not read a broken configuration file as a declaration', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'KalderaShield-release-config-'));
    try {
      fs.writeFileSync(path.join(dir, 'release-config.json'), '{ not json');
      expect(readRepoReleaseConfig(dir)).toEqual({});
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ships a committed configuration that matches the documented release', () => {
    // The repository's own file, not a fixture: this is the configuration the
    // next release will actually use.
    const config = readRepoReleaseConfig(
      path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', 'release'),
    );

    expect(config.desktopPlatforms).toBe('windows');
    expect(config.allowUnsignedPlatforms).toBe('windows');
  });
});
