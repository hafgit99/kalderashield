/**
 * Tests for the Linux collect step's signature-payload gate.
 *
 * Runs under vitest (the scripts glob picks up *.test.mjs). The step is shell
 * inside a workflow, and the workflow's own comments are explicit that shell
 * there is only tested by a failing release -- v7.0.12.0, v7.0.13.0 and
 * v7.0.14.0 were all lost to shell that no test executed.
 *
 * The instance this guards: v7.0.20 published
 * `KalderaShield-7.0.20-1.x86_64.rpm.sig` with no `.rpm` beside it. The RPM is
 * built by Tauri's `rpm` crate in-process, so `bundle/rpm/` always held the
 * package, but the collect step only copied `*.sig`, `*.tar.gz` and
 * `*.nsis.zip`. The release shipped a signature that verified nothing.
 *
 * An orphaned signature is more dangerous than an absent one: an absent file is
 * a gap a user can see, while a signature implies a guarantee it cannot keep.
 *
 * The workflow step is read from the YAML rather than reimplemented, so this
 * test fails when the workflow stops calling the script rather than passing
 * against a copy that no longer matches.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WORKFLOW = path.resolve('.github/workflows/release-desktop.yml');
const SCRIPT = path.resolve('scripts/verify-signature-payloads.cjs');

/** A staging directory shaped like the real v7.0.20 Linux output. */
const FIXTURE_SIGNED = [
  'KalderaShield-7.0.20.0-linux-amd64.deb',
  'KalderaShield-7.0.20.0-linux-amd64.deb.sig',
  'KalderaShield-7.0.20.0-linux-x64.AppImage',
  'KalderaShield-7.0.20.0-linux-x64.AppImage.sig',
];

/** The bug, exactly: the signature shipped, the package did not. */
const FIXTURE_ORPHANED = [
  ...FIXTURE_SIGNED,
  'KalderaShield-7.0.20-1.x86_64.rpm.sig',
];

function runVerify(dir) {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, '--dir', dir], { encoding: 'utf8' });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: error.status ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

describe('release signature payload gate', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'ks-sig-payload-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeFixture(files) {
    for (const file of files) {
      writeFileSync(path.join(dir, file), 'fixture');
    }
  }

  it('passes when every signature has its payload', () => {
    writeFixture(FIXTURE_SIGNED);
    const result = runVerify(dir);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Signature payload check passed');
  });

  it('fails on an orphaned RPM signature -- the v7.0.20 shape', () => {
    writeFixture(FIXTURE_ORPHANED);
    const result = runVerify(dir);
    expect(result.code).toBe(1);
    // Must name the offending file, not just fail: a release operator reading
    // the log has to know which artifact to go and look for.
    expect(result.stderr).toContain('KalderaShield-7.0.20-1.x86_64.rpm.sig');
    expect(result.stderr).toContain('KalderaShield-7.0.20-1.x86_64.rpm');
  });

  it('rejects a missing directory rather than passing vacuously', () => {
    const result = runVerify(path.join(dir, 'does-not-exist'));
    expect(result.code).toBe(2);
  });

  it('requires a --dir argument', () => {
    const result = (() => {
      try {
        execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
        return { code: 0 };
      } catch (error) {
        return { code: error.status ?? 1 };
      }
    })();
    expect(result.code).toBe(2);
  });

  it('the Linux collect step actually runs this check', () => {
    const workflow = require('node:fs').readFileSync(WORKFLOW, 'utf8');
    // The gate is only meaningful if the step that stages the signatures
    // invokes it. A script with no caller is documentation, not a check.
    expect(workflow).toContain('verify-signature-payloads.cjs --dir release-local/linux');
  });

  it('the Linux collect step copies the RPM package, not only its signature', () => {
    const workflow = require('node:fs').readFileSync(WORKFLOW, 'utf8');
    // The root cause: `*.rpm` was never in the copy list.
    expect(workflow).toMatch(/-name '\*\.rpm' -exec cp/);
  });
});