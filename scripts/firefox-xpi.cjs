const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const firefoxDistDir = path.join(rootDir, 'dist-extension-firefox');
const stagingDir = path.join(rootDir, '.tmp', 'firefox-xpi');
const artifactsDir = path.join(rootDir, 'release-local', 'firefox');
const packageJson = require(path.join(rootDir, 'package.json'));

const args = new Set(process.argv.slice(2));
const shouldSign = args.has('--sign');
const skipBuild = args.has('--skip-build');
const channel = process.env.AMO_CHANNEL || 'unlisted';
const approvalTimeout = process.env.AMO_APPROVAL_TIMEOUT || process.env.WEB_EXT_APPROVAL_TIMEOUT;
const xpiName = `kalderashield-firefox-v${packageJson.version}.xpi`;

const AMO_API_BASE = 'https://addons.mozilla.org/api/v5';

const excludedNames = new Set([
  'KalderaShield-host.bat',
  'com.kalderashield.desktop.json',
]);

function maskCommandArgs(cmdArgs) {
  const masked = [...cmdArgs];
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === '--api-secret' || masked[i] === '--api-key') {
      if (i + 1 < masked.length) {
        masked[i + 1] = '********';
      }
    }
  }
  return masked;
}

const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');

function resolveExecutable(command, commandArgs) {
  let executable = command;
  let args = commandArgs;

  if (command === 'npm') {
    if (fs.existsSync(npmCli)) {
      executable = process.execPath;
      args = [npmCli, ...commandArgs];
    } else {
      executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    }
  } else if (command === 'npx') {
    if (fs.existsSync(npxCli)) {
      executable = process.execPath;
      args = [npxCli, ...commandArgs];
    } else {
      executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    }
  } else if (command === 'node') {
    executable = process.execPath;
    args = commandArgs;
  }

  const shell = !fs.existsSync(npmCli) && process.platform === 'win32' && (command === 'npm' || command === 'npx');
  return { executable, args, shell };
}

function run(command, commandArgs, options = {}) {
  const { executable, args, shell } = resolveExecutable(command, commandArgs);

  console.log(`\n> ${command} ${maskCommandArgs(commandArgs).join(' ')}`);
  const result = spawnSync(executable, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell,
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

/**
 * Runs a command and captures its output instead of streaming it.
 *
 * The signing step needs to read web-ext's error: "already exists" is not a
 * failure to report, it is a state to recover from (see
 * fetchAlreadySignedXpi).
 */
function runCapture(command, commandArgs, options = {}) {
  const { executable, args, shell } = resolveExecutable(command, commandArgs);

  console.log(`\n> ${command} ${maskCommandArgs(commandArgs).join(' ')}`);
  const result = spawnSync(executable, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell,
    ...options,
  });

  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  return { status: result.status, stdout, stderr };
}

function copyCleanExtension(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludedNames.has(entry.name) || entry.name.endsWith('.map')) continue;

    const sourcePath = path.join(src, entry.name);
    const destinationPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyCleanExtension(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function readStagedManifest() {
  return JSON.parse(fs.readFileSync(path.join(stagingDir, 'manifest.json'), 'utf8'));
}

function assertFirefoxManifest() {
  const manifest = readStagedManifest();
  const geckoId = manifest.browser_specific_settings?.gecko?.id;

  if (geckoId !== 'kalderashield@hafgit99.com') {
    throw new Error('Firefox manifest must include browser_specific_settings.gecko.id = kalderashield@hafgit99.com');
  }

  // The packaged manifest must carry the release version.
  //
  // `build-extension.js` stamps `package.json`'s version into every built
  // manifest, so this normally passes without anyone thinking about it. The
  // check exists because a stale staging directory (or a build that skipped the
  // stamping step) would otherwise produce an XPI with an old version, and AMO
  // rejects a version it has already signed -- the failure would appear as a
  // confusing upload error on release day, not as a stale manifest.
  if (manifest.version !== packageJson.version) {
    throw new Error(
      'Firefox manifest version ' + manifest.version + ' does not match package.json ' +
      packageJson.version + '. Run npm run build:extension before packaging.',
    );
  }

  if (manifest.background?.service_worker) {
    throw new Error('Firefox build must use background.scripts, not background.service_worker');
  }

  return manifest;
}

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Builds the JWT the AMO API expects.
 *
 * HS256, `iss` = the API key (the "JWT issuer"), signed with the API secret.
 * The lifetime is deliberately short: this token is only used for two requests
 * during a release.
 *
 * Why the hash below is SHA-256 and not a password KDF: this is a message
 * authentication code, not password storage. The API secret is the HMAC *key*,
 * the signed bytes are the public header and payload, and HS256 is the
 * algorithm the AMO API requires -- a verifier given an argon2/bcrypt digest
 * could not check the token at all. CodeQL's js/insufficient-password-hash
 * flags any credential-shaped value that reaches a fast hash, which is what
 * the suppression marker on the call records: the alert is a false positive
 * here, and "fixing" it would break the protocol.
 */
function createAmoJwt(apiKey, apiSecret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({
    iss: apiKey,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 60,
  }));
  // codeql[js/insufficient-password-hash]
  const signature = base64url(
    crypto.createHmac('sha256', apiSecret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${signature}`;
}

/**
 * Downloads the artifact AMO already signed for this version.
 *
 * Why this exists: AMO accepts a given version exactly once. A release whose
 * publish job fails after the extension job signed burns that version -- the
 * next attempt gets `409 Conflict: Version X already exists` and the pipeline
 * published an *unsigned* XPI, which Firefox Release refuses to install. That
 * is not a hypothetical: v7.0.25 hit it, after the publish job failed on an
 * unrelated path-separator bug.
 *
 * The version was signed from the same commit (the release is tag-gated and the
 * version comes from package.json), so the file AMO holds is the file this
 * build would have produced. Reusing it is strictly better than shipping an
 * unsigned package, and the alternative -- bumping the version to get a new
 * signature -- would publish a version nobody tested.
 *
 * @returns {Promise<boolean>} whether a signed artifact was written
 */
async function fetchAlreadySignedXpi(apiKey, apiSecret, guid, version, destination) {
  if (typeof fetch !== 'function') {
    console.error('This Node.js has no global fetch, so the signed artifact cannot be retrieved.');
    return false;
  }

  const jwt = createAmoJwt(apiKey, apiSecret);
  const versionUrl =
    `${AMO_API_BASE}/addons/addon/${encodeURIComponent(guid)}/versions/${encodeURIComponent(version)}/`;

  console.log(`\nAMO already signed ${version}; asking it for that artifact: ${versionUrl}`);
  const metadataResponse = await fetch(versionUrl, {
    headers: { Authorization: `JWT ${jwt}`, Accept: 'application/json' },
  });

  if (!metadataResponse.ok) {
    console.error(`AMO version lookup failed with HTTP ${metadataResponse.status}.`);
    return false;
  }

  const metadata = await metadataResponse.json();
  const fileUrl = metadata?.file?.url;
  if (typeof fileUrl !== 'string' || !fileUrl) {
    console.error('AMO returned no download URL for this version.');
    return false;
  }

  // The download URL comes from a remote API response, so it is checked before
  // it is fetched rather than trusted: HTTPS, and a Mozilla host. A response
  // that points somewhere else is a bug or a compromise, and either way this
  // script must not follow it.
  let parsedFileUrl;
  try {
    parsedFileUrl = new URL(fileUrl);
  } catch {
    console.error('AMO returned a download URL that is not a URL.');
    return false;
  }
  if (parsedFileUrl.protocol !== 'https:') {
    console.error(`Refusing to download the signed XPI over ${parsedFileUrl.protocol}.`);
    return false;
  }
  if (!/(^|\.)mozilla\.org$/i.test(parsedFileUrl.hostname) && !/(^|\.)mozilla\.net$/i.test(parsedFileUrl.hostname)) {
    console.error(`Refusing to download the signed XPI from an unexpected host: ${parsedFileUrl.hostname}`);
    return false;
  }

  const fileResponse = await fetch(parsedFileUrl, { headers: { Authorization: `JWT ${jwt}` } });
  if (!fileResponse.ok) {
    console.error(`Downloading the signed XPI failed with HTTP ${fileResponse.status}.`);
    return false;
  }

  const bytes = Buffer.from(await fileResponse.arrayBuffer());

  // A signed XPI is a zip; refuse anything that is not, rather than publishing
  // an error page as an extension package.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    console.error('The downloaded artifact is not a zip/XPI.');
    return false;
  }

  fs.writeFileSync(destination, bytes);
  console.log(`AMO-signed xpi retrieved (${bytes.length} bytes) and installed as ${path.basename(destination)}`);
  return true;
}

function isAlreadySignedError(output) {
  return /already exists/i.test(output) || /Submission failed \(2\)/i.test(output);
}

async function main() {
  if (!skipBuild) {
    run('npm', ['run', 'build:extension']);
  }

  if (!fs.existsSync(firefoxDistDir)) {
    throw new Error('dist-extension-firefox does not exist. Run npm run build:extension first.');
  }

  fs.mkdirSync(artifactsDir, { recursive: true });
  copyCleanExtension(firefoxDistDir, stagingDir);
  const manifest = assertFirefoxManifest();
  const guid = manifest.browser_specific_settings.gecko.id;

  run('npx', ['web-ext', 'lint', '--source-dir', stagingDir]);

  if (!shouldSign) {
    run('npx', [
      'web-ext',
      'build',
      '--source-dir',
      stagingDir,
      '--artifacts-dir',
      artifactsDir,
      '--filename',
      xpiName,
      '--overwrite-dest',
    ]);
    console.log(`\nFirefox artifact output: ${artifactsDir}`);
    return;
  }

  const apiKey = process.env.WEB_EXT_API_KEY || process.env.AMO_API_KEY;
  const apiSecret = process.env.WEB_EXT_API_SECRET || process.env.AMO_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error('Missing AMO credentials.');
    console.error('Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET, or AMO_API_KEY and AMO_API_SECRET.');
    process.exit(1);
  }

  const signArgs = [
    'web-ext',
    'sign',
    '--source-dir',
    stagingDir,
    '--artifacts-dir',
    artifactsDir,
    '--channel',
    channel,
    '--no-input',
  ];

  if (approvalTimeout) {
    signArgs.push('--approval-timeout', approvalTimeout);
  }

  // Pass credentials safely via environment variables to avoid exposing secrets in process lists
  const signEnv = {
    ...process.env,
    WEB_EXT_API_KEY: apiKey,
    WEB_EXT_API_SECRET: apiSecret,
  };

  const signResult = runCapture('npx', signArgs, { env: signEnv });
  const signOutput = `${signResult.stdout}\n${signResult.stderr}`;
  const unsignedPath = path.join(artifactsDir, xpiName);

  if (signResult.status === 0) {
    // `web-ext sign` has no --filename (that flag is `build`-only), so AMO names
    // the download from the add-on slug: KalderaShield_vault_7-<version>.xpi. Left alone,
    // the unsigned xpiName from the packaging step would sit next to it and both
    // would be uploaded and cosign-signed. Replace the unsigned one.
    const signedXpis = fs
      .readdirSync(artifactsDir)
      .filter((name) => name.endsWith('.xpi') && name !== xpiName);

    if (signedXpis.length === 0) {
      console.error(`AMO signing reported success but no signed .xpi appeared in ${artifactsDir}`);
      process.exit(1);
    }
    if (signedXpis.length > 1) {
      console.error(`Expected exactly one signed .xpi, found: ${signedXpis.join(', ')}`);
      process.exit(1);
    }

    const signedPath = path.join(artifactsDir, signedXpis[0]);
    fs.rmSync(unsignedPath, { force: true });
    if (signedXpis[0] !== xpiName) {
      fs.renameSync(signedPath, unsignedPath);
    }
    console.log(`AMO-signed xpi installed as ${xpiName}`);
    console.log(`\nFirefox artifact output: ${artifactsDir}`);
    return;
  }

  // The version is already signed. Recover the artifact AMO holds instead of
  // failing the release (which would publish an unsigned package).
  if (isAlreadySignedError(signOutput)) {
    const recovered = await fetchAlreadySignedXpi(
      apiKey,
      apiSecret,
      guid,
      packageJson.version,
      unsignedPath,
    );
    if (recovered) {
      console.log(`\nFirefox artifact output: ${artifactsDir}`);
      return;
    }
    console.error('AMO has this version signed, but the signed artifact could not be retrieved.');
  }

  // Any other failure is reported as it happened; the caller decides whether to
  // publish the unsigned package.
  process.exit(signResult.status || 1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

// Exported for the tests: the JWT is security-relevant and a wrong base64url
// alphabet would only fail at AMO, on release day.
module.exports = { createAmoJwt, isAlreadySignedError };
