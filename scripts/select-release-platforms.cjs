#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decides which desktop platforms a release run may publish.
 *
 * This is the most safety-critical decision in the release pipeline and it was
 * originally written as inline shell inside the workflow, where nothing can
 * test it. A mistake here either publishes something unsigned or silently ships
 * nothing, so it lives here instead, where the tests are.
 *
 * The rule that matters: **an unset variable selects every platform.** That
 * preserves the pre-existing fail-closed behaviour exactly. The failure mode to
 * avoid is the obvious-looking one where a missing variable quietly resolves to
 * "build nothing" -- a release job that skips every platform and publishes
 * nothing, reported as a green run.
 *
 * Linux is always included and can never be deselected: it is the one platform
 * whose artifacts need no certificate, and a release with no Linux build is not
 * a release. Naming it explicitly (`linux`) is how a release says "no desktop
 * certificates this time" -- and that token has to be *accepted*, not rejected
 * as a typo, or the only certificate-free route out of the pipeline is a dead
 * end that fails the whole release. See `RECOGNISED` below.
 *
 * Writes GitHub Actions outputs to stdout as `key=value` lines, and appends to
 * $GITHUB_OUTPUT when that environment variable is set.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const SUPPORTED_OPTIONAL = ['macos', 'windows'];
const ALWAYS = 'linux';

/**
 * Tokens the selector accepts.
 *
 * This is deliberately NOT `SUPPORTED_OPTIONAL`. `linux` is a legal request that
 * simply adds nothing, because Linux is included unconditionally; treating it as
 * an unknown platform made `RELEASE_DESKTOP_PLATFORMS=linux` exit 1 -- while the
 * unit test `can narrow to a Linux-only release` happily passed, because
 * `selectReleasePlatforms` returns the right selection and only the CLI entry
 * point rejected the token. A test on the selection alone could never have
 * caught it. The distinguishing assertion is on `unknown`, and there is one now.
 */
const RECOGNISED = new Set([...SUPPORTED_OPTIONAL, ALWAYS]);

/**
 * Platforms that can be published without an operating-system code-signing
 * certificate.
 *
 * Linux is not here: its packages carry no OS-level signature at all, so there
 * is nothing to declare. The declaration exists for the platforms where the
 * *absence* of a signature is a visible, alarming fact for the user: Windows
 * SmartScreen and macOS Gatekeeper.
 */
const DECLARABLE_UNSIGNED = new Set(SUPPORTED_OPTIONAL);

/**
 * Parses `vars.ALLOW_UNSIGNED_PLATFORMS` into a list of platform names.
 *
 * Unset, blank and the literal "none" all mean "no platform may be published
 * unsigned", which is the fail-closed default and the behaviour of the
 * pipeline before this variable existed.
 *
 * @param {string|undefined|null} raw
 * @returns {string[]}
 */
function parseAllowUnsignedPlatforms(raw) {
  const normalized = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!normalized || normalized === 'none') return [];
  return normalized.split(',').filter(Boolean);
}

/**
 * Reads the committed release configuration.
 *
 * The repository variables (`RELEASE_DESKTOP_PLATFORMS`,
 * `ALLOW_UNSIGNED_PLATFORMS`) are the operational override, but they live in
 * the repository settings, which are not always reachable: the Variables tab
 * is not shown for every account, and the values are invisible in a diff.
 *
 * `release/release-config.json` is the committed default. It is versioned,
 * reviewable, and travels with the code that depends on it. The variable
 * wins when it is set; this file is used when it is not.
 *
 * @returns {{desktopPlatforms?: string, allowUnsignedPlatforms?: string}}
 */
function readRepoReleaseConfig(configDir = path.join(rootDir, 'release')) {
  const configPath = path.join(configDir, 'release-config.json');
  if (!fs.existsSync(configPath)) return {};

  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!raw || typeof raw !== 'object') return {};
    return {
      desktopPlatforms:
        typeof raw.desktopPlatforms === 'string' ? raw.desktopPlatforms : undefined,
      allowUnsignedPlatforms:
        typeof raw.allowUnsignedPlatforms === 'string' ? raw.allowUnsignedPlatforms : undefined,
    };
  } catch (error) {
    // A broken config must not be read as "no declaration" silently. The
    // pipeline still fails closed for anything that needs a declaration, but
    // the operator is told that the file they wrote is not being used.
    console.error(`::warning::Could not read ${configPath}: ${error.message}`);
    return {};
  }
}

/**
 * Resolves a setting from the environment first and the committed config
 * second.
 *
 * An environment value that is set but empty is treated as "not set", because
 * GitHub expands an unset repository variable to an empty string -- which
 * would otherwise mask the committed file on every run.
 *
 * @param {string|undefined} envValue
 * @param {string|undefined} fileValue
 * @returns {string|undefined}
 */
function resolveSetting(envValue, fileValue) {
  const fromEnv = String(envValue ?? '').trim();
  if (fromEnv) return fromEnv;
  const fromFile = String(fileValue ?? '').trim();
  return fromFile ? fromFile : undefined;
}

/**
 * Decides, per platform, whether the release builds it signed or unsigned.
 *
 * The rules, in order:
 *
 *   1. A platform that is not selected is `skipped`. It produces nothing, so it
 *      has no signing state to decide.
 *   2. A platform with a certificate available is `signed`, always. Declaring a
 *      platform unsigned must never *downgrade* a platform that could have been
 *      signed: the certificate exists, so the release signs.
 *   3. A selected platform with no certificate is `unsigned` only if it was
 *      declared in `vars.ALLOW_UNSIGNED_PLATFORMS`.
 *   4. A selected platform with no certificate and no declaration is `blocked`.
 *      It is an error, not a fallback: publishing it unsigned without a
 *      declaration is exactly what the Y-19 gate exists to prevent, and the
 *      release must fail before it builds anything rather than halfway through
 *      a ninety-minute build job.
 *
 * @param {{selection: string, allowUnsigned?: string|null, certificates?: {windows?: boolean, macos?: boolean}}} input
 * @returns {{modes: Record<string,string>, unsignedPlatforms: string[], declared: string[], unknown: string[]}}
 */
function resolveSigningModes({ selection, allowUnsigned, certificates = {} }) {
  const declared = parseAllowUnsignedPlatforms(allowUnsigned);
  const unknown = declared.filter((name) => !DECLARABLE_UNSIGNED.has(name));
  const selected = String(selection ?? '').split(',').filter(Boolean);

  const modes = {};
  for (const platform of SUPPORTED_OPTIONAL) {
    if (!selected.includes(platform)) {
      modes[platform] = 'skipped';
      continue;
    }
    if (certificates[platform]) {
      modes[platform] = 'signed';
      continue;
    }
    modes[platform] = declared.includes(platform) ? 'unsigned' : 'blocked';
  }

  return {
    modes,
    unsignedPlatforms: SUPPORTED_OPTIONAL.filter((platform) => modes[platform] === 'unsigned'),
    declared,
    unknown,
  };
}

/**
 * @param {string|undefined|null} requested raw value of vars.RELEASE_DESKTOP_PLATFORMS
 * @returns {{selection: string, macos: boolean, windows: boolean, normalized: string, requestedWasUnset: boolean}}
 */
function selectReleasePlatforms(requested) {
  const raw = String(requested ?? '');
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '');

  // Unset, blank or the literal "all" all mean "every platform". This is the
  // fail-closed default and must not drift.
  const requestedWasUnset = normalized === '' || normalized === 'all';
  const optional = requestedWasUnset ? SUPPORTED_OPTIONAL : normalized.split(',').filter(Boolean);

  const unknown = optional.filter((name) => !RECOGNISED.has(name));

  const macos = optional.includes('macos');
  const windows = optional.includes('windows');

  // Deduplicate and put Linux first, always.
  const selection = [ALWAYS, macos ? 'macos' : null, windows ? 'windows' : null]
    .filter(Boolean)
    .join(',');

  return { selection, macos, windows, normalized, requestedWasUnset, unknown };
}

function main() {
  // The committed configuration is the default; the repository variables are
  // the operational override. Both are read here, and the variable wins when
  // it is set.
  const repoConfig = readRepoReleaseConfig();

  const requestedPlatforms = resolveSetting(
    process.env.REQUESTED_PLATFORMS,
    repoConfig.desktopPlatforms,
  );
  const allowUnsignedPlatforms = resolveSetting(
    process.env.ALLOW_UNSIGNED_PLATFORMS,
    repoConfig.allowUnsignedPlatforms,
  );

  const result = selectReleasePlatforms(requestedPlatforms);
  const { selection, macos, windows, normalized, requestedWasUnset, unknown } = result;

  if (unknown.length > 0) {
    // Loud, not silent. A typo must not quietly produce a partial release.
    console.error(
      `::error::Unsupported platform(s) in RELEASE_DESKTOP_PLATFORMS: ${unknown.join(', ')}`
    );
    console.error(
      `::error::Supported: ${[...SUPPORTED_OPTIONAL, ALWAYS].join(', ')} (comma-separated), or "all". `
      + `${ALWAYS} is always built; naming it on its own is how a release ships without macOS/Windows certificates.`,
    );
    process.exit(1);
  }

  // Which platforms may be published without an operating-system code-signing
  // certificate, and which certificate is actually available right now.
  //
  // The certificate check is an emptiness test on a secret, never a print of
  // it: the workflow maps the secret into the environment and this script only
  // ever sees whether it is there.
  const certificates = {
    windows: String(process.env.WINDOWS_CERT_PRESENT || '').toLowerCase() === 'true',
    macos: String(process.env.MACOS_CERT_PRESENT || '').toLowerCase() === 'true',
  };

  const signing = resolveSigningModes({
    selection,
    allowUnsigned: allowUnsignedPlatforms,
    certificates,
  });

  if (signing.unknown.length > 0) {
    console.error(
      `::error::Unsupported platform(s) in ALLOW_UNSIGNED_PLATFORMS: ${signing.unknown.join(', ')}`
    );
    console.error(
      `::error::Supported: ${[...DECLARABLE_UNSIGNED].join(', ')} (comma-separated). `
      + `Linux has no OS-level signature and needs no declaration.`,
    );
    process.exit(1);
  }

  const blocked = Object.entries(signing.modes)
    .filter(([, mode]) => mode === 'blocked')
    .map(([platform]) => platform);

  if (blocked.length > 0) {
    // Fail here, not ninety minutes into a build job.
    //
    // The alternative was the status quo: the certificate import step inside
    // the build job throws, the job fails after the whole toolchain and the
    // test suite have already run, and the reason is a missing secret that
    // nothing in the log mentions. Saying it here names the variable and the
    // two ways out.
    console.error(
      `::error::No signing certificate available for: ${blocked.join(', ')}.`
    );
    console.error(
      '::error::Either configure the platform signing secrets, exclude the platform'
      + ' with RELEASE_DESKTOP_PLATFORMS, or declare it in ALLOW_UNSIGNED_PLATFORMS'
      + ' to publish it without an OS-level signature.',
    );
    process.exit(1);
  }

  const outputs = {
    macos: String(macos),
    windows: String(windows),
    selection,
    'windows-signing': signing.modes.windows,
    'macos-signing': signing.modes.macos,
    'unsigned-platforms': signing.unsignedPlatforms.join(','),
  };
  for (const [key, value] of Object.entries(outputs)) {
    console.log(`${key}=${value}`);
    if (process.env.GITHUB_OUTPUT) {
      require('fs').appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
  }

  console.log(
    `Requested platforms: ${
      requestedWasUnset ? '<unset> (defaulting to all)' : normalized
    } -> building: ${selection}`
  );

  if (signing.unsignedPlatforms.length > 0) {
    console.log(
      `::warning::Publishing UNSIGNED artifacts for: ${signing.unsignedPlatforms.join(', ')}.`
    );
    console.log(
      '::warning::These payloads carry no operating-system code signature. Their updater'
      + ' signature (minisign) is still present and still verified by the client, but'
      + ' Windows SmartScreen will warn on a manual download.',
    );
  }

  if (!macos || !windows) {
    const excluded = [];
    if (!macos) excluded.push('macos');
    if (!windows) excluded.push('windows');
    console.log(
      `::warning::Partial desktop release: ${selection}. Not published: ${excluded.join(', ')}.`
    );
    console.log(
      '::warning::Those platforms get no auto-update offer and stay on their current version.'
    );
  }
}

if (require.main === module) main();

module.exports = {
  selectReleasePlatforms,
  resolveSigningModes,
  parseAllowUnsignedPlatforms,
  readRepoReleaseConfig,
  resolveSetting,
  ALWAYS,
  SUPPORTED_OPTIONAL,
  RECOGNISED,
  DECLARABLE_UNSIGNED,
};
