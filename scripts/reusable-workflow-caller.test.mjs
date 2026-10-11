/**
 * Structural guard for jobs that call a local reusable workflow.
 *
 * When the three desktop build jobs were collapsed into
 * `_reusable-desktop-build.yml` (P2-6), the caller jobs kept their `runs-on` and
 * `timeout-minutes` lines out of habit. GitHub does not accept those on a job
 * that uses `uses:` — a caller job may only set `name`, `uses`, `with`,
 * `secrets`, `strategy`, `needs`, `if`, `concurrency` and `permissions`. The
 * runner and the timeout belong to the *called* workflow, which already reads
 * them from `inputs.runner` / `inputs.timeout-minutes`.
 *
 * The consequence is not a failing step, it is a workflow that GitHub refuses to
 * load at all, so the desktop release pipeline silently stops existing. That is
 * exactly the class of change that looks finished after a YAML parse and a
 * structural diff. This test enforces the rule for every caller in the repo so
 * the next refactor cannot reintroduce it.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW_DIR = path.resolve('.github/workflows');

/**
 * Keys GitHub permits on a job that calls a reusable workflow. Anything else --
 * notably `runs-on`, `timeout-minutes` and `steps` -- makes the file invalid.
 * See https://docs.github.com/actions/using-workflows/reusing-workflows#calling-a-reusable-workflow
 */
const CALLER_ALLOWED_KEYS = new Set([
  'name',
  'uses',
  'with',
  'secrets',
  'strategy',
  'needs',
  'if',
  'concurrency',
  'permissions',
]);

/**
 * Collects the direct keys of each job under `jobs:`.
 *
 * Deliberately not a YAML parser: it tracks indentation to find the `jobs:`
 * block, then reads the keys sitting two columns in from each job id. Workflow
 * files here use one key per line at job level, and a parser dependency for this
 * would be worse than the thing it guards.
 */
function parseJobKeys(source) {
  const lines = source.split(/\r?\n/);
  const jobsIndent = lines.findIndex((line) => /^jobs:\s*$/.test(line));
  if (jobsIndent === -1) {
    throw new Error('no `jobs:` block found');
  }

  const jobs = [];
  let current = null;
  let keyIndent = null;

  for (let i = jobsIndent + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (/^\S/.test(line)) break; // left the `jobs:` block

    const indent = line.length - line.trimStart().length;
    const match = /^(\s*)([\w.-]+):(\s|$)/.exec(line);
    if (!match) continue;

    const key = match[2];

    // A job id sits two columns left of its own keys.
    if (keyIndent === null || indent < keyIndent) {
      current = { jobId: key, keys: [] };
      jobs.push(current);
      keyIndent = indent + 2;
      continue;
    }

    if (indent === keyIndent && current) {
      current.keys.push(key);
    }
  }

  return jobs;
}

function localReusableCallers(source) {
  return parseJobKeys(source).filter((job) =>
    job.keys.includes('uses'),
  );
}

describe('reusable workflow callers', () => {
  it('release-desktop.yml calls the shared desktop build without runner keys', () => {
    const source = readFileSync(
      path.join(WORKFLOW_DIR, 'release-desktop.yml'),
      'utf8',
    );
    const callers = localReusableCallers(source);

    expect(callers.map((job) => job.jobId)).toEqual([
      'build-linux',
      'build-macos',
      'build-windows',
    ]);

    for (const job of callers) {
      const illegal = job.keys.filter((key) => !CALLER_ALLOWED_KEYS.has(key));
      expect(
        illegal,
        `${job.jobId} calls a reusable workflow but also sets ${illegal.join(', ')}. ` +
          'A caller job takes its runner and timeout from the called workflow, ' +
          'which reads them from inputs.runner / inputs.timeout-minutes.',
      ).toEqual([]);
    }
  });

  it('the shared desktop build takes its runner and timeout as required inputs', () => {
    const source = readFileSync(
      path.join(WORKFLOW_DIR, '_reusable-desktop-build.yml'),
      'utf8',
    );

    expect(source).toMatch(/^on:\s*$/m);
    expect(source).toMatch(/^\s{2}workflow_call:\s*$/m);

    // Required, not defaulted: the runner depends on the platform, so a static
    // default would be a wrong answer for two of the three callers.
    for (const input of ['runner', 'timeout-minutes']) {
      const block = new RegExp(`^\\s{6}${input}:\\n(?:\\s{8}.+\\n)+`, 'm').exec(source);
      expect(block, `${input} is not declared as an input`).not.toBeNull();
      expect(block[0]).toMatch(/required:\s*true/);
    }

    // ...and the called job reads exactly those inputs.
    expect(source).toMatch(/runs-on:\s*\$\{\{\s*inputs\.runner\s*\}\}/);
    expect(source).toMatch(/timeout-minutes:\s*\$\{\{\s*inputs\.timeout-minutes\s*\}\}/);
  });

  it('every caller passes the inputs the shared build requires', () => {
    const source = readFileSync(
      path.join(WORKFLOW_DIR, 'release-desktop.yml'),
      'utf8',
    );

    for (const job of localReusableCallers(source)) {
      // `with:` keys sit four columns in from the job id.
      const block = new RegExp(`^\\s{4}with:\\n((?:\\s{6}.+\\n|\\s{8}.+\\n)+)`, 'm')
        .exec(source.slice(source.indexOf(`\n  ${job.jobId}:`)));
      expect(block, `${job.jobId} has no with: block`).not.toBeNull();
      expect(block[1], `${job.jobId} must pass runner:`).toMatch(
        /^\s{6}runner:\s*\S/m,
      );
      expect(block[1], `${job.jobId} must pass timeout-minutes:`).toMatch(
        /^\s{6}timeout-minutes:\s*\S/m,
      );
    }
  });

  it('never reads an input into `shell:`, which GitHub rejects at load time', () => {
    // `shell:` is resolved before any step runs, and the `inputs` context is not
    // available there. The expression is not a runtime failure -- GitHub refuses
    // to load the file, so the run appears as an instant failure with zero jobs
    // and no log to explain it. That is how this file was found broken.
    //
    // The two conditional steps carrying the bash and pwsh variants are the
    // supported way to pick a shell from an input; `if:` does get `inputs`.
    for (const file of readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith('.yml'))) {
      const source = readFileSync(path.join(WORKFLOW_DIR, file), 'utf8');
      const offenders = source
        .split(/\r?\n/)
        .map((line, index) => ({ line: index + 1, text: line }))
        .filter(({ text }) => /^\s*shell:\s*\$\{\{/.test(text));

      expect(
        offenders,
        `${file}: \`shell:\` must be a literal. Use two steps with ` +
          '`if:` conditions to choose between shells.',
      ).toEqual([]);
    }
  });
});