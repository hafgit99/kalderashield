#!/usr/bin/env node
/**
 * @file scripts/generate-android-update-manifest.cjs
 * @description Generates `android-latest.json`, the update manifest for the
 * Android sideload channel.
 *
 * Why a separate file at all: the Tauri updater supports Windows, Linux and
 * macOS only. Its `updater_os()` returns `None` on Android, so `check()`
 * fails with `UnsupportedOs` and the Tauri manifest's platform keys do not
 * cover Android either. An Android build therefore cannot install an update
 * itself, and the channel it *can* have is "tell the user, hand them the APK".
 *
 * The manifest is a plain static file with a version-less name, published
 * next to `latest.json`. `releases/latest/download/android-latest.json`
 * resolves to the newest non-prerelease release, which is the same release
 * the desktop updater is offered by -- one release, two channels, no way for
 * the two to disagree about which version is current.
 *
 * What the client does with it: compare the announced version with the
 * running one, and if it is newer, open the APK download in the browser.
 * Android then performs an in-place update, because the APK carries the same
 * release keystore and a higher `versionCode`.
 *
 * @license Apache-2.0
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const packageJson = require(path.join(rootDir, 'package.json'));
const tauriConfig = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'src-tauri', 'tauri.conf.json'), 'utf8'),
);

// Overridable so the tests can point the generator at a scratch directory.
const releaseLocalDir = process.env.RELEASE_LOCAL_DIR
  ? path.resolve(process.env.RELEASE_LOCAL_DIR)
  : path.join(rootDir, 'release-local');
const androidDir = path.join(releaseLocalDir, 'android');
const updaterOutputDir = path.join(releaseLocalDir, 'updater');

// The version the running app reports at runtime. On Android that is
// `tauri.conf.json`, so the comparison the client performs is between two
// numbers produced by the same source.
const version = tauriConfig.version || packageJson.version;

/**
 * Resolves the release tag the download URL must point at.
 *
 * `RELEASE_TAG` is set by the release workflow to `${{ github.ref_name }}`.
 * It is not always `v${packageJson.version}`: package.json carries a 4-part
 * version (7.0.25.0) and the release workflow accepts the trimmed tag
 * (v7.0.25). Reconstructing the tag instead of reading it produced a
 * manifest whose download URL pointed at a release that does not exist.
 */
function resolveReleaseTag() {
  const explicit = String(process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME || '').trim();
  if (explicit) {
    return explicit.startsWith('v') ? explicit : `v${explicit}`;
  }
  return `v${packageJson.version.replace(/(\.0)+$/, '')}`;
}

const repositoryField = packageJson.repository;
const repositoryUrl =
  typeof repositoryField === 'string' ? repositoryField : (repositoryField?.url ?? '');
const repoUrl = repositoryUrl
  ? repositoryUrl.replace(/^(git\+|git:)/, '').replace(/\.git$/, '')
  : 'https://github.com/hafgit99/kalderashield';
const releaseTag = resolveReleaseTag();

/**
 * Picks the APK the update channel points at.
 *
 * The universal APK is preferred: it is the one that runs on every device
 * the release supports, so a user never has to know their own ABI. When it is
 * absent the largest APK is used, which is the closest equivalent.
 */
function pickApk(files) {
  const apks = files.filter((name) => name.toLowerCase().endsWith('.apk'));
  if (apks.length === 0) return null;

  const universal = apks.find((name) => name.includes('universal-universal'));
  if (universal) return universal;

  return apks
    .map((name) => ({ name, size: fs.statSync(path.join(androidDir, name)).size }))
    .sort((a, b) => b.size - a.size)[0].name;
}

/**
 * Reads the Android `versionCode` the build produced, when the build recorded
 * it.
 *
 * The build job writes `release-local/android/android-release.json` from
 * `src-tauri/gen/android/app/tauri.properties`, which the Tauri CLI
 * regenerates during the build. The publish job does not have that file, so
 * the value travels with the artifacts.
 */
function readVersionCode() {
  const metadataPath = path.join(androidDir, 'android-release.json');
  if (!fs.existsSync(metadataPath)) return undefined;

  try {
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const code = Number(metadata.versionCode);
    return Number.isFinite(code) && code > 0 ? code : undefined;
  } catch {
    return undefined;
  }
}

function readNotes() {
  const notesPath = path.join(androidDir, 'RELEASE-NOTES.md');
  if (!fs.existsSync(notesPath)) return `KalderaShield ${version}`;
  try {
    return fs.readFileSync(notesPath, 'utf8').trim();
  } catch {
    return `KalderaShield ${version}`;
  }
}

function generateManifest() {
  if (!fs.existsSync(androidDir)) {
    console.error('✗ No Android artifacts were collected.');
    console.error('  release-local/android/ does not exist, so there is nothing to');
    console.error('  advertise. Publishing an empty manifest would tell every Android');
    console.error('  user that there is no update when the truth is that the release');
    console.error('  has no Android build.');
    process.exit(1);
  }

  const apkName = pickApk(fs.readdirSync(androidDir));
  if (!apkName) {
    console.error('✗ No APK was found under release-local/android/.');
    process.exit(1);
  }

  const apkPath = path.join(androidDir, apkName);
  const bytes = fs.readFileSync(apkPath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

  const manifest = {
    version,
    publishedAt: new Date().toISOString(),
    notes: readNotes(),
    apk: {
      url: `${repoUrl}/releases/download/${releaseTag}/${encodeURIComponent(apkName)}`,
      sha256,
      size: bytes.length,
      fileName: apkName,
    },
  };

  const versionCode = readVersionCode();
  if (versionCode !== undefined) {
    manifest.versionCode = versionCode;
  }

  if (!fs.existsSync(updaterOutputDir)) {
    fs.mkdirSync(updaterOutputDir, { recursive: true });
  }

  const manifestPath = path.join(updaterOutputDir, 'android-latest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`✓ Android update manifest written to: ${path.relative(rootDir, manifestPath)}`);
  console.log(`  Version: ${version}${versionCode ? ` (versionCode ${versionCode})` : ''}`);
  console.log(`  APK: ${apkName} (${bytes.length} bytes)`);
  console.log(`  Download URL: ${manifest.apk.url}\n`);
}

generateManifest();
