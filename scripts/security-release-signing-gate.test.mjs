/**
 * Tests for the Y-19 release signing gate.
 *
 * The gate is a security gate: it decides whether a desktop release may ship
 * without an operating-system code signature. A gate that has been loosened
 * without anyone noticing is worse than no gate, because the log says PASS.
 *
 * These tests run the gate as a subprocess against a mutated copy of the
 * workflows, because the only honest way to assert "this must fail" is to
 * make it fail and look at the exit code.
 *
 * The case that motivated them: the guard on the shared spine's signing steps
 * was checked by comparing the whole `if:` expression literally, so adding a
 * second condition to the guard (`&& inputs.signing-mode != 'unsigned'`) turned
 * the gate red even though the invariant it protects still held. The check is
 * now on the *shape* of the condition, and these tests are what keeps that
 * change honest: a guard that is removed, inverted, or turned into a
 * disjunction must still fail the gate.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..');
const workflowsDir = path.join(rootDir, '.github', 'workflows');
const spineName = '_reusable-desktop-build.yml';

const tempTrees = [];

/**
 * Builds a throwaway copy of the repository layout the gate reads:
 * the gate script, the workflow directory and the signing guide.
 */
function stageGateTree(mutate) {
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'KalderaShield-y19-gate-'));
  tempTrees.push(tree);

  fs.mkdirSync(path.join(tree, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(tree, '.github', 'workflows'), { recursive: true });
  fs.mkdirSync(path.join(tree, 'docs'), { recursive: true });

  fs.copyFileSync(
    path.join(here, 'security-release-signing-gate.cjs'),
    path.join(tree, 'scripts', 'security-release-signing-gate.cjs'),
  );
  for (const name of fs.readdirSync(workflowsDir)) {
    if (!name.endsWith('.yml')) continue;
    fs.copyFileSync(
      path.join(workflowsDir, name),
      path.join(tree, '.github', 'workflows', name),
    );
  }
  fs.copyFileSync(
    path.join(rootDir, 'docs', 'CODE_SIGNING_GUIDE_2026.md'),
    path.join(tree, 'docs', 'CODE_SIGNING_GUIDE_2026.md'),
  );

  if (mutate) {
    const spinePath = path.join(tree, '.github', 'workflows', spineName);
    fs.writeFileSync(spinePath, mutate(fs.readFileSync(spinePath, 'utf8')), 'utf8');
  }

  return tree;
}

function runGate(tree) {
  try {
    const stdout = execFileSync(
      process.execPath,
      [path.join(tree, 'scripts', 'security-release-signing-gate.cjs')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
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

afterEach(() => {
  while (tempTrees.length > 0) {
    const tree = tempTrees.pop();
    fs.rmSync(tree, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
});

describe('Y-19 release signing gate', () => {
  it('passes on the repository as it stands', () => {
    const result = runGate(stageGateTree(null));

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/Status: PASS/);
  });

  it('fails when the signing guard is removed from the shared spine', () => {
    const result = runGate(
      stageGateTree((source) =>
        source.replace(
          /if: \$\{\{ inputs\.prep-steps != '' && inputs\.signing-mode != 'unsigned' \}\}/,
          'if: true',
        ),
      ),
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/prep-steps must be guarded/);
  });

  it('fails when the signing guard is inverted', () => {
    // `inputs.prep-steps == ''` would run the step exactly when the caller
    // sent no script, which is the failure the guard exists to prevent.
    const result = runGate(
      stageGateTree((source) =>
        source.replace(
          /if: \$\{\{ inputs\.prep-steps != '' && inputs\.signing-mode != 'unsigned' \}\}/,
          "if: ${{ inputs.prep-steps == '' }}",
        ),
      ),
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/prep-steps/);
  });

  it('fails when the guard becomes a disjunction', () => {
    // One alternative is enough to run the step with no script at all.
    const result = runGate(
      stageGateTree((source) =>
        source.replace(
          /if: \$\{\{ inputs\.prep-steps != '' && inputs\.signing-mode != 'unsigned' \}\}/,
          "if: ${{ inputs.prep-steps != '' || inputs.signing-mode == 'unsigned' }}",
        ),
      ),
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/conjunction/);
  });

  it('fails when the signing report gate loses --require-signed', () => {
    // The gate the spine runs is the only place the release is blocked.
    const result = runGate(
      stageGateTree((source) =>
        source.replace(/--require-signed/, '--no-require-signed'),
      ),
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/--require-signed/);
  });

  it('fails when the spine is allowed to create a release', () => {
    // A pipeline component that could publish is a second release pipeline.
    const result = runGate(
      stageGateTree((source) => source.replace('contents: read', 'contents: write')),
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/contents: write/);
  });
});
