/**
 * Tests for the Android update manifest generator.
 *
 * Runs as a subprocess on purpose, for the same reason the desktop manifest
 * test does: the assertion that matters is the process exit code and the file
 * it wrote, and importing the module would run the generator as a side
 * effect.
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..');

// A scratch staging directory, never the repository's own `release-local/`.
const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'KalderaShield-android-manifest-'));
const releaseLocal = path.join(stagingRoot, 'release-local');
const updaterDir = path.join(releaseLocal, 'updater');
const androidDir = path.join(releaseLocal, 'android');

function run(extraEnv = {}) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [path.join(here, 'generate-android-update-manifest.cjs')],
      {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, RELEASE_LOCAL_DIR: releaseLocal, ...extraEnv },
      },
    );
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: error.status ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

function writeApk(name, contents) {
  fs.mkdirSync(androidDir, { recursive: true });
  fs.writeFileSync(path.join(androidDir, name), contents);
}

afterEach(() => {
  fs.rmSync(releaseLocal, { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
});

describe('android update manifest generation', () => {
  it('fails when no Android artifact was collected', () => {
    // An empty manifest would tell every Android user that there is no
    // update, when the truth is that the release has no Android build.
    fs.mkdirSync(androidDir, { recursive: true });

    const result = run();

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/no apk/i);
  });

  it('advertises the universal APK with its digest and size', () => {
    writeApk('app-universal-universal-release.apk', 'apk-bytes');
    writeApk('app-universal-arm64-v8a-release.apk', 'arm64-bytes');

    const result = run({ RELEASE_TAG: 'v9.9.9-android-test' });
    expect(result.code).toBe(0);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(updaterDir, 'android-latest.json'), 'utf8'),
    );
    expect(manifest.apk.fileName).toBe('app-universal-universal-release.apk');
    expect(manifest.apk.url).toContain('/download/v9.9.9-android-test/');
    expect(manifest.apk.url).not.toContain('v9.9.9-android-test.0');
    expect(manifest.apk.size).toBe('apk-bytes'.length);
    expect(manifest.apk.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('carries the versionCode the build recorded', () => {
    writeApk('app-universal-universal-release.apk', 'apk-bytes');
    fs.writeFileSync(
      path.join(androidDir, 'android-release.json'),
      JSON.stringify({ versionName: '7.0.25', versionCode: 7000025 }),
    );

    const result = run();
    expect(result.code).toBe(0);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(updaterDir, 'android-latest.json'), 'utf8'),
    );
    expect(manifest.versionCode).toBe(7000025);
  });

  it('omits the versionCode when the build did not record one', () => {
    // The field is optional, not required: the client compares version names,
    // and Android derives the versionCode from that same version.
    writeApk('app-universal-universal-release.apk', 'apk-bytes');

    const result = run();
    expect(result.code).toBe(0);

    const manifest = JSON.parse(
      fs.readFileSync(path.join(updaterDir, 'android-latest.json'), 'utf8'),
    );
    expect(manifest.versionCode).toBeUndefined();
    expect(manifest.version).toBeTruthy();
  });
});
