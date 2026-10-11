#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Y-19 gate: the release workflow must not be able to publish an unsigned
 * desktop build, and the signing steps must be secret-driven.
 *
 * The `desktop:release:signing:report -- --require-signed` gate already fails a
 * job whose artifacts are unsigned, which is the fail-closed behaviour we want.
 * What it cannot catch is the *mechanical* side: a signing step that was
 * deleted, reordered before the build, or pointed at the wrong secrets would
 * still leave the gate in place, and the failure would only show up as a red
 * job on release day.
 *
 * These checks are static and run in ordinary CI, so a regression in the
 * workflow is caught long before a release is attempted.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
/**
 * The release pipeline is two files.
 *
 * `release-desktop.yml` owns the trigger, the platform selection and the
 * per-platform signing scripts; `_reusable-desktop-build.yml` owns the sequence
 * those scripts run inside. Every check below used to read the first file only,
 * because until P2-6 that was the whole pipeline. It is not any more, and the
 * gate reported the extraction as thirteen failures -- including "missing
 * signing step" for steps that were still present, now as script bodies in a
 * `with:` block.
 *
 * So the subject of these checks is the pair. That is a widening of what is
 * scanned and a narrowing of nothing: each assertion below is about the pipeline
 * shipping a signed, gated build, and a fact split across two files is still a
 * fact about the pipeline.
 */
const workflowsDir = path.join(rootDir, '.github', 'workflows');
const workflowPath = path.join(workflowsDir, 'release-desktop.yml');
const spineName = '_reusable-desktop-build.yml';
const spinePath = path.join(workflowsDir, spineName);
const guidePath = path.join(rootDir, 'docs', 'CODE_SIGNING_GUIDE_2026.md');

const failures = [];
const notes = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

/**
 * YAML with comments removed, so a policy scan cannot be satisfied or tripped
 * by prose.
 *
 * This workflow directory is heavily commented, deliberately: several of these
 * checks exist because a step was once reordered or deleted, and the reasoning
 * is worth keeping next to the code. Scanning the raw text meant the unsigned
 * build workflow failed the `--require-signed` assertion on the comment that
 * explains why it does not run that flag. A commented-out `npx tauri build` does
 * not package anything either, so it should not be able to fail the build check
 * for the same reason.
 *
 * Only `#` outside quotes starts a comment, which keeps values such as
 * `ref: 'v1#2'` intact.
 */
function stripYamlComments(source) {
  return source
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*#/.test(line)) return '';
      let quote = null;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (quote) {
          if (char === quote) quote = null;
          continue;
        }
        if (char === '"' || char === "'") {
          quote = char;
          continue;
        }
        if (char === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
      }
      return line;
    })
    .join('\n');
}

function main() {
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const spine = fs.readFileSync(spinePath, 'utf8');
  const guide = fs.readFileSync(guidePath, 'utf8');

  // Anything that may live in either file. Order is not meaningful here; §4
  // checks ordering within a single file on purpose.
  const pipeline = `${workflow}\n${spine}`;

  // --- 1. Every desktop platform must keep the blocking signing gates. -------
  //
  // The gates are parameterised by platform and run once in the shared spine,
  // so "linux, macos and windows each block" is now expressed as: the spine
  // blocks, and all three callers reach it. Checking that the literal string
  // `--platform linux` exists somewhere would be satisfied by a comment.
  check(
    /desktop:release:signing:report[^\n]*--require-signed/.test(spine) &&
      /desktop:release:signing:report[^\n]*--platform \$\{\{ inputs\.platform \}\}/.test(spine),
    `${spineName}: the shared build must run the signing report gate with --require-signed for every platform`
  );
  check(
    /desktop:release:gate[^\n]*--platform \$\{\{ inputs\.platform \}\}/.test(spine),
    `${spineName}: the shared build must run the desktop release gate for every platform`
  );
  const callers = ['build-linux', 'build-macos', 'build-windows'].filter((job) =>
    new RegExp(`^  ${job}:\\n(?:.*\\n)*?    uses: \\./\\.github/workflows/${spineName}`, 'm').test(workflow)
  );
  check(
    callers.length === 3,
    `release-desktop.yml: linux, macos and windows must all build through ${spineName} (found: ${callers.join(', ') || 'none'})`
  );
  for (const platform of ['linux', 'macos', 'windows']) {
    check(
      new RegExp(`^      platform: ${platform}$`, 'm').test(workflow),
      `release-desktop.yml: the ${platform} caller must pass platform: ${platform}`
    );
  }

  // --- 2. macOS must not be pinned to an ad-hoc identity. --------------------
  // `APPLE_SIGNING_IDENTITY: "-"` alone means every build is ad-hoc signed and
  // can never pass `spctl --assess`.
  //
  // Matched against YAML *assignments* only. An earlier version of this check
  // matched the same text inside a comment describing the old behaviour, which
  // produced a false failure; a gate that cries wolf gets ignored.
  const hardcodedAdHoc = /^\s*APPLE_SIGNING_IDENTITY:\s*["']-["']\s*$/m;
  check(
    !hardcodedAdHoc.test(pipeline),
    'release-desktop.yml: APPLE_SIGNING_IDENTITY must not be hardcoded to "-" (ad-hoc signing)'
  );
  check(
    pipeline.includes('APPLE_SIGNING_IDENTITY_RESOLVED'),
    'release-desktop.yml: the macOS build must use a resolved Developer ID identity when one was imported'
  );
  check(
    pipeline.includes('xcrun notarytool submit'),
    'release-desktop.yml: the macOS job must submit the build for notarization'
  );
  check(
    pipeline.includes('xcrun stapler staple'),
    'release-desktop.yml: the macOS job must staple the notarization ticket'
  );

  // --- 3. Windows must actually sign. ----------------------------------------
  check(
    pipeline.includes('Import-PfxCertificate'),
    'release-desktop.yml: the Windows job must import the Authenticode certificate'
  );
  check(
    pipeline.includes('signtool sign'),
    'release-desktop.yml: the Windows job must sign its artifacts with signtool'
  );
  check(
    /\/tr\s+\$timestamp|\/tr\s+\S+timestamp/i.test(pipeline),
    'release-desktop.yml: Authenticode signatures must be timestamped so they outlive certificate expiry'
  );

  // --- 4. Signing must happen after the build, not before. -------------------
  //
  // Two orderings are asserted because there are two. Within one caller the
  // signing script sits after the build command that produces its artifacts;
  // within the spine the step that runs that script sits after the build step.
  // Either alone would be satisfiable while the other was wrong.
  const buildIndex = workflow.indexOf('npx tauri build');
  const windowsSignIndex = workflow.indexOf('signtool sign');
  check(
    buildIndex !== -1 && windowsSignIndex !== -1 && windowsSignIndex > buildIndex,
    'release-desktop.yml: Windows signing must run after `npx tauri build` (artifacts must exist first)'
  );

  const macBuildIndex = workflow.indexOf('npx tauri build --target universal-apple-darwin');
  const notarizeIndex = workflow.indexOf('xcrun notarytool submit');
  check(
    macBuildIndex !== -1 && notarizeIndex !== -1 && notarizeIndex > macBuildIndex,
    'release-desktop.yml: macOS notarization must run after the macOS build'
  );

  const spineBuildIndex = spine.indexOf('run: ${{ inputs.build-command }}');
  const spineSignIndex = spine.indexOf('run: ${{ inputs.post-steps }}');
  check(
    spineBuildIndex !== -1 && spineSignIndex !== -1 && spineSignIndex > spineBuildIndex,
    `${spineName}: the signing script must run after the build step, or the artifacts it signs do not exist yet`
  );

  // --- 5. Signing must be conditional on the caller supplying it. ------------
  // An unconditional script step referencing an empty secret fails confusingly;
  // a guarded one lets the gate produce the real, actionable error. Since P2-6
  // the signing work is a script the caller passes in, so "conditional" means
  // two things: the spine runs it only when the caller sent something, and the
  // platforms that need signing actually send it.
  for (const phase of ['prep-steps', 'post-steps']) {
    check(
      new RegExp(`if: \\$\\{\\{ inputs\\.${phase} != '' \\}\\}`, 'm').test(spine),
      `${spineName}: ${phase} must be guarded by an if: so a platform that sends no script cannot run one`
    );
  }
  for (const job of ['build-macos', 'build-windows']) {
    const jobStart = workflow.indexOf(`\n  ${job}:`);
    // The next line at job-id indentation ends this job. Searching from
    // character 1 skips the header we just matched.
    const rest = workflow.slice(jobStart + 1);
    const nextOffset = rest.slice(1).search(/^ {2}\S[\w-]*:$/m);
    const body = nextOffset === -1 ? rest : rest.slice(0, nextOffset + 1);
    for (const phase of ['prep-steps', 'post-steps']) {
      check(
        new RegExp(`^ {6}${phase}: \\|`, 'm').test(body),
        `release-desktop.yml: ${job} must pass a ${phase} script; without one it publishes unsigned`
      );
    }
  }
  // The secrets have to reach the script's environment. `secrets: inherit` on
  // the caller makes them visible to the called workflow; it does not bind them
  // to a step. Omitting the binding fails the script at an unbound variable,
  // which reads like a missing secret rather than a missing env entry.
  //
  // Matched as a `env:`-mapping entry rather than by secret name, because the
  // env name need not equal the secret name -- APPLE_KEYCHAIN_PASSWORD is bound
  // as KEYCHAIN_PASSWORD, which is what the macOS script reads.
  for (const secret of [
    'APPLE_SIGNING_CERT_P12',
    'APPLE_KEYCHAIN_PASSWORD',
    'APPLE_ID',
    'APPLE_TEAM_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'WINDOWS_SIGNING_CERT_BASE64',
    'WINDOWS_SIGNING_CERT_PASSWORD',
  ]) {
    check(
      new RegExp(`^ +\\w+: \\$\\{\\{ secrets\\.${secret} \\}\\} *$`, 'm').test(spine),
      `${spineName}: ${secret} must be bound into the signing script's env`
    );
  }

  // --- 6. The certificate must not be left lying around. ---------------------
  check(
    pipeline.includes('rm -f "$CERT_PATH"') && pipeline.includes('trap cleanup EXIT'),
    'release-desktop.yml: the macOS signing keychain and certificate file must be cleaned up'
  );
  check(
    pipeline.includes('Remove-Item -Force $pfxPath'),
    'release-desktop.yml: the Windows .pfx must be deleted after import'
  );

  // --- 7. Every *signing* secret the pipeline reads must be documented. ------
  // Scoped to signing-related secrets on purpose: the pipeline also reads
  // updater, extension and release-endpoint secrets which belong in other
  // documents, and demanding they appear here would be noise.
  const SIGNING_SECRET_PATTERN =
    /(APPLE_[A-Z0-9_]+|WINDOWS_SIGNING_[A-Z0-9_]+|ANDROID_KEYSTORE_BASE64|KALDERASHIELD_ANDROID_[A-Z0-9_]+|TAURI_SIGNING_[A-Z0-9_]+)/;
  const referenced = new Set();
  for (const match of pipeline.matchAll(/secrets\.([A-Z0-9_]+)/g)) {
    if (SIGNING_SECRET_PATTERN.test(match[1])) referenced.add(match[1]);
  }
  for (const secret of referenced) {
    check(
      guide.includes(secret),
      `docs/CODE_SIGNING_GUIDE_2026.md: signing secret ${secret} is used by the pipeline but not documented`
    );
  }
  notes.push(`signing secrets checked: ${[...referenced].sort().join(', ')}`);

  // --- 8. The gate must be the thing that blocks, not a warning. ------------
  check(
    !/continue-on-error:\s*true[\s\S]{0,200}signing:report/.test(pipeline),
    'release-desktop.yml: the signing gate must not be marked continue-on-error'
  );

  // --- 9. There must be exactly one desktop release pipeline. ---------------
  //
  // Y-19 follow-up. `release-desktop-manual.yml` was a pre-Y-19 workflow left in
  // the repo: it had no `--require-signed` gate and pinned macOS to
  // `APPLE_SIGNING_IDENTITY: "-"`, i.e. ad-hoc, which is precisely what Y-19
  // removed from the real pipeline. It could not publish (`contents: read`) and
  // it was a strict subset of the tag-gated pipeline, so it had no legitimate
  // release function -- only the standing risk that someone grants it publish
  // rights later and every Y-19 guarantee silently stops applying.
  //
  // Deleting the file is not enough on its own, because nothing stopped it from
  // being re-added. Any *other* workflow that packages a desktop build is a
  // second pipeline, and it will not be covered by the checks above, which all
  // read `release-desktop.yml` only. So the duplication itself is the invariant.
  //
  // The shared spine is the one file that legitimately packages a build without
  // being a pipeline: it has no trigger of its own, no publish permission, and
  // exists only because release-desktop.yml calls it. That is verified below
  // rather than assumed, so naming it here cannot by itself widen what the gate
  // tolerates.
  const otherWorkflows = fs
    .readdirSync(workflowsDir)
    .filter((name) => name.endsWith('.yml') && name !== 'release-desktop.yml');

  /**
   * Every route to a packaged desktop build, not just the literal command.
   *
   * Scanning for `tauri build` alone was enough while the only pipeline spelled
   * it out. build-windows-unsigned.yml calls `npm run release:local:skip-tests`
   * instead, which runs the same build one level down, and the text scan reported
   * a green PASS over a workflow that packages a desktop build. The invariant was
   * already broken; only the detector had not caught up.
   *
   * The npm-script names are here for that reason. If a future wrapper hides the
   * build one level deeper again, this check has to move with it -- a check that
   * can be passed by naming the step differently is not a gate.
   */
  const packagingRoutes = [
    /tauri\s+build/,
    /release:local/,
    /release:collect/,
    /desktop:release:gate/,
    /local-release\.cjs/,
  ];

  /**
   * Workflows allowed to build without a certificate, with the reason recorded.
   *
   * An entry here is a claim that the workflow cannot turn an unsigned build into
   * a published one. That claim is verified below rather than trusted, so adding
   * a name to this list cannot by itself weaken anything: the workflow still has
   * to prove it can neither publish, nor run with write access, nor remove the
   * signing gate from the pipeline it shares with the release job.
   */
  const UNSIGNED_BUILD_EXCEPTIONS = {
    'build-windows-unsigned.yml':
      'manual-only unsigned Windows build; uploads a CI artifact and publishes no release',
  };

  /**
   * Files allowed to package a build because they are part of the signed
   * pipeline rather than a second one. Same rule as above: an entry is a claim,
   * and the claim is checked below rather than trusted.
   */
  const PIPELINE_COMPONENTS = {
    [spineName]: 'shared build spine; has no trigger and is called only by release-desktop.yml',
  };

  for (const name of otherWorkflows) {
    const contents = fs.readFileSync(path.join(workflowsDir, name), 'utf8');
    const effective = stripYamlComments(contents);
    const packages = packagingRoutes.some((route) => route.test(effective));
    const exception = UNSIGNED_BUILD_EXCEPTIONS[name];
    const component = PIPELINE_COMPONENTS[name];

    if (packages && component) {
      // It must not be reachable on its own: `workflow_call` only, and no
      // `workflow_dispatch` or `push`/`schedule` that would let a version push
      // drive it directly.
      check(
        /workflow_call/.test(effective) && !/workflow_dispatch|^\s*(push|schedule):/m.test(effective),
        `${name}: is a pipeline component but must stay workflow_call only, never triggerable on its own`
      );
      // It must not be able to publish, or become a release pipeline the moment
      // someone widens its permissions.
      check(
        !/softprops\/action-gh-release|gh\s+release|gh\s+--?create/.test(effective),
        `${name}: is a pipeline component but must not create a GitHub Release`
      );
      check(
        !/contents:\s*write/.test(effective),
        `${name}: is a pipeline component but must not request contents: write`
      );
      // Whatever else happens to it, it inherits the blocking gate. If a future
      // edit removes --require-signed, the caller would ship unsigned artifacts
      // through a pipeline whose gates all live in this file.
      check(
        /--require-signed/.test(effective),
        `${name}: is a pipeline component but must keep --require-signed; it is the only place the gate runs`
      );
      // ...and it has to still be wired to the pipeline, or it is dead code
      // that happens to package a build.
      check(
        workflow.includes(`uses: ./.github/workflows/${name}`),
        `release-desktop.yml: ${name} is treated as a pipeline component but nothing calls it`
      );
      notes.push(`pipeline component accepted: ${name} (${component})`);
    } else if (packages && !exception) {
      check(
        false,
        `${name}: must not package a desktop build; release-desktop.yml is the only release pipeline`
      );
      continue;
    }

    if (packages && exception) {
      // The exception is a permission boundary, not a naming convention. Each
      // assertion below removes one way the unsigned build could reach a user.
      check(
        !/softprops\/action-gh-release|gh\s+release|gh\s+--?create/.test(effective),
        `${name}: is allowed to build unsigned but must not create a GitHub Release (exception: ${exception})`
      );
      check(
        !/contents:\s*write/.test(effective),
        `${name}: is allowed to build unsigned but must not request contents: write (exception: ${exception})`
      );
      check(
        !/--require-signed/.test(effective),
        `${name}: must not run the blocking signing gate itself; that gate belongs to release-desktop.yml`
      );
      // Manual only: a tag-triggered run would let a version push produce an
      // unsigned artifact as a side effect of an ordinary release.
      check(
        /workflow_dispatch/.test(effective) && !/^\s*push:/m.test(effective),
        `${name}: unsigned build workflows must be workflow_dispatch only, never tag- or push-triggered`
      );
      notes.push(`unsigned-build exception applied: ${name} (${exception})`);
    }

    check(
      !/APPLE_SIGNING_IDENTITY:\s*"?-/.test(effective),
      `${name}: must not pin macOS to an ad-hoc signing identity (Y-19)`
    );
  }
  notes.push(
    otherWorkflows.length
      ? `other workflows checked for duplicate release pipelines: ${otherWorkflows.sort().join(', ')}`
      : 'no other workflows present'
  );

  for (const note of notes) console.log(`  note: ${note}`);

  if (failures.length > 0) {
    console.error('Status: FAIL — Y-19 release signing gate checks failed:');
    for (const failure of failures) console.error(`  FAIL ${failure}`);
    process.exit(1);
  }

  console.log('Status: PASS — Y-19 release signing gate checks passed.');
  console.log('  Signing steps are secret-driven, correctly ordered, and every desktop job blocks on --require-signed.');
  console.log('  Without the signing secrets configured, a public desktop release remains impossible by design.');
}

main();
