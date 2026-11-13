/**
 * @file scripts/generate-updater-manifest.cjs
 * @description Generates a Tauri v2 compliant `latest.json` updater manifest for local releases.
 * Reads generated artifacts and signature files from release-local/ and produces
 * the distribution manifest ready for uploading to GitHub Releases or self-hosted servers.
 *
 * @license Apache-2.0
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJson = require(path.join(rootDir, 'package.json'));
// Overridable so the tests can point the generator at a scratch directory.
//
// This is not a convenience. The generator's staging directory is `release-local/`,
// which is also where the release pipeline puts the artifacts it has just
// collected — and `desktop:release:gate` runs the unit suite *after* collecting
// them, on the way to uploading them. A test that wrote to the real
// `release-local/` was therefore reading whatever the release had staged (its
// "no signed artifact" case found real .sig files and exited 0 instead of
// failing), and its `afterEach` deleted the collected artifacts out from under
// the upload step.
const releaseLocalDir = process.env.RELEASE_LOCAL_DIR
  ? path.resolve(process.env.RELEASE_LOCAL_DIR)
  : path.join(rootDir, 'release-local');
const updaterOutputDir = path.join(releaseLocalDir, 'updater');

const version = packageJson.version; // full numeric version, e.g. 7.0.5.0 (tag + artifact names)
// Tauri updater manifest must carry a valid 3-part semver (the parser rejects
// a 4th numeric part: "unexpected character '.' after patch version number").
// The app's own runtime version comes from tauri.conf.json (e.g. 7.0.5), so
// the manifest version MUST match it exactly for the update comparison.
const tauriConf = JSON.parse(fs.readFileSync(path.join(rootDir, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const updaterVersion = tauriConf.version || version.split('.').slice(0, 3).join('.');
// `repository` may be a string ("owner/name" or a URL) or the npm object form
// ({ type, url }), which is what npm documents and what this package.json now
// declares. `.replace` on the object form threw "repository.replace is not a
// function" and took the whole manifest generator down, so the updater manifest
// could not be produced at all. Normalise both before stripping the .git suffix.
const repositoryField = packageJson.repository;
const repositoryUrl = typeof repositoryField === 'string'
  ? repositoryField
  : (repositoryField?.url ?? '');
const repoUrl = repositoryUrl
  ? repositoryUrl.replace(/^(git\+|git:)/, '').replace(/\.git$/, '')
  : 'https://github.com/hafgit99/kalderashield';
// The tag the release is published under is NOT always `v${packageJson.version}`.
//
// package.json carries a 4-part version (the Android versionCode scheme), and
// the release workflow accepts a tag with the trailing `.0` trimmed: v7.0.24 is
// a valid tag for version 7.0.24.0, and v7.0.24.0 is a valid tag for it too.
// The tag therefore has to come from the workflow, not be reconstructed here.
//
// Reconstructing it produced a manifest that pointed every download at a
// release that does not exist. v7.0.24 was published as tag `v7.0.24`, and
// the published latest.json contained:
//
//   .../releases/download/v7.0.24.0/KalderaShield-7.0.24.0-linux-x64.AppImage
//
// which returns 404, while the correct URL (.../download/v7.0.24/...) returns
// 200. An updater whose own manifest links to a 404 cannot update anybody, on
// any platform -- and the failure is silent, because the manifest itself is
// served fine and only the payload download fails.
const releaseTag = resolveReleaseTag();
const downloadBaseUrl = `${repoUrl}/releases/download/${releaseTag}`;

/**
 * Resolves the release tag the download URLs must point at.
 *
 * Priority:
 *   1. `RELEASE_TAG` -- set by the release workflow to `${{ github.ref_name }}`.
 *      This is the only source that cannot be wrong: it is the tag the release
 *      was actually created under.
 *   2. `GITHUB_REF_NAME` -- the same value, available automatically inside a
 *      GitHub Actions run.
 *   3. The package version with its trailing `.0` segments trimmed, which
 *      mirrors the release workflow's own tag/version comparison. This is the
 *      local-run fallback, where no tag exists yet.
 *
 * @returns {string} tag beginning with "v"
 */
function resolveReleaseTag() {
  const explicit = String(process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME || '').trim();
  if (explicit) {
    return explicit.startsWith('v') ? explicit : `v${explicit}`;
  }
  return `v${version.replace(/(\.0)+$/, '')}`;
}

const TAURI_MINISIGN_COMMENT = 'untrusted comment: signature from tauri secret key';

/**
 * Reads a Tauri updater signature file and validates it as a genuine Tauri
 * minisign signature. Tauri CLI writes the .sig file as the base64 encoding of
 * the minisign document (single line), while some toolchains emit plain
 * minisign ASCII. Both are accepted; the original file content is returned
 * because the updater expects the .sig file contents verbatim.
 * Returns null when the file is not a Tauri minisign signature.
 */
function readTauriSignature(sigFilePath) {
  let raw;
  try {
    raw = fs.readFileSync(sigFilePath, 'utf8').trim();
  } catch (_) {
    return null;
  }
  if (raw.includes(TAURI_MINISIGN_COMMENT)) return raw;
  if (/^[A-Za-z0-9+/=]+$/.test(raw)) {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      if (decoded.includes(TAURI_MINISIGN_COMMENT)) return raw;
    } catch (_) { /* fall through */ }
  }
  return null;
}

/**
 * Maps an updater artifact file name to the Tauri updater platform keys it
 * serves. Only bundles the updater can actually install are mapped:
 *   windows: .exe (NSIS) -> windows-x86_64-nsis + windows-x86_64,
 *            .msi        -> windows-x86_64-msi
 *   macos:   .app.tar.gz -> universal + intel + apple silicon keys
 *   linux:   .AppImage   -> linux-x86_64 + x86_64-unknown-linux-gnu
 * (.dmg/.deb/.rpm are installers but not updater-supported bundles.)
 */
function updaterKeysForArtifact(platformName, fileName) {
  const f = fileName.toLowerCase();
  if (platformName === 'windows') {
    if (f.endsWith('.msi')) return ['windows-x86_64-msi'];
    if (f.endsWith('.exe')) return ['windows-x86_64-nsis', 'windows-x86_64'];
    return [];
  }
  if (platformName === 'macos') {
    if (f.endsWith('.app.tar.gz')) {
      return ['universal-apple-darwin', 'darwin-x86_64', 'darwin-aarch64'];
    }
    return [];
  }
  if (platformName === 'linux') {
    if (f.endsWith('.appimage')) return ['linux-x86_64', 'x86_64-unknown-linux-gnu'];
    return [];
  }
  return [];
}

function generateManifest() {
  console.log(`\n📦 Generating Tauri v2 Auto-Updater Manifest (latest.json) for v${version} (updater semver: ${updaterVersion})...`);

  // `recursive: true` creates the directory if it is missing and does nothing
  // if it is there. An existence check followed by the create is a
  // time-of-check/time-of-use race for no benefit, and CodeQL flags that
  // shape (`js/file-system-race`).
  fs.mkdirSync(updaterOutputDir, { recursive: true });

  // Load release notes if available
  let releaseNotes = `KalderaShield ${version} Release`;
  const releaseNotesPath = path.join(releaseLocalDir, 'windows', 'RELEASE_NOTES.md');
  if (fs.existsSync(releaseNotesPath)) {
    try {
      releaseNotes = fs.readFileSync(releaseNotesPath, 'utf8').trim();
    } catch (_) {}
  }

  const manifest = {
    version: updaterVersion,
    notes: releaseNotes,
    pub_date: new Date().toISOString(),
    platforms: {},
  };

  // Scan release-local directories for platform packages & signatures
  const platformNames = ['windows', 'macos', 'linux'];

  for (const platformName of platformNames) {
    const platformDir = path.join(releaseLocalDir, platformName);
    if (!fs.existsSync(platformDir)) continue;

    for (const file of fs.readdirSync(platformDir)) {
      if (!file.endsWith('.sig')) continue;

      const signature = readTauriSignature(path.join(platformDir, file));
      if (!signature) continue;

      const bundleFileName = file.replace(/\.sig$/, '');
      const bundleFilePath = path.join(platformDir, bundleFileName);
      if (!fs.existsSync(bundleFilePath)) continue;

      const targetKeys = updaterKeysForArtifact(platformName, bundleFileName);
      if (targetKeys.length === 0) continue;

      const downloadUrl = `${downloadBaseUrl}/${encodeURIComponent(bundleFileName)}`;

      for (const targetKey of targetKeys) {
        manifest.platforms[targetKey] = {
          signature: signature,
          url: downloadUrl,
        };
      }
    }
  }

  const manifestPath = path.join(updaterOutputDir, 'latest.json');
  const configured = Object.keys(manifest.platforms);

  // Platforms published without an operating-system code signature.
  //
  // The declaration is made by the release pipeline (vars.ALLOW_UNSIGNED_PLATFORMS)
  // and is written into the manifest so that it travels with the artifact
  // instead of living only in a CI log. The client reads it and tells the user
  // what they are about to install.
  //
  // Tauri ignores unknown top-level fields (serde does not use
  // `deny_unknown_fields` on `RemoteRelease`), so this field is inert for the
  // updater itself and cannot break a client.
  //
  // Only platforms that are actually present in the manifest are listed. A
  // declaration for a platform this release does not serve would claim
  // something untrue about the release.
  const declaredUnsigned = String(process.env.UNSIGNED_PLATFORMS || '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  // The declaration vocabulary (the release scripts' platform names) and the
  // manifest's platform-key vocabulary are not the same for macOS: the release
  // pipeline calls it `macos`, the updater manifest calls it `darwin`, because
  // that is the name the Tauri updater derives from the operating system.
  const MANIFEST_KEY_PREFIX = { windows: 'windows-', macos: 'darwin-', linux: 'linux-' };
  const unsignedPlatforms = declaredUnsigned.filter((platform) => {
    const prefix = MANIFEST_KEY_PREFIX[platform];
    if (!prefix) return false;
    return configured.some((key) => key === platform || key.startsWith(prefix));
  });
  if (unsignedPlatforms.length > 0) {
    manifest.unsigned_platforms = unsignedPlatforms;
  }

  // An empty manifest is not a valid updater target, and writing one with exit
  // code 0 is how a release ships that silently breaks auto-update: every
  // client reads `platforms: {}`, matches nothing, and either does nothing or
  // errors, depending on the Tauri version.
  //
  // Every entry is skipped silently by design elsewhere -- a missing `.sig` must
  // not fail the build, because a build legitimately runs before signing. That
  // is right for the per-platform scan and wrong for the end result. So the
  // scan stays lenient and the outcome is checked once, here.
  //
  // This was already a latent bug; making desktop platforms optional made it
  // reachable by a Linux-only release.
  if (configured.length === 0) {
    console.error('✗ Updater manifest has no platform entries.');
    console.error('  No artifact with a valid Tauri minisign signature was found under');
    console.error('  release-local/. Publishing this would ship a release whose auto-update');
    console.error('  is broken for every platform.');
    process.exit(1);
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`✓ Updater manifest written to: ${path.relative(rootDir, manifestPath)}`);
  console.log(`  Target Version: v${version}`);
  console.log(`  Target Platforms Configured: ${configured.join(', ')}`);
  console.log(`  Download Base URL: ${downloadBaseUrl}`);
  if (unsignedPlatforms.length > 0) {
    console.log(`  UNSIGNED (no OS code signature): ${unsignedPlatforms.join(', ')}`);
  }
  console.log('');
}

generateManifest();
