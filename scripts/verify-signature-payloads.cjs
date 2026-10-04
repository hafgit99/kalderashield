#!/usr/bin/env node
/**
 * Verify that every staged release signature has a payload beside it.
 *
 * Why this exists
 * ---------------
 * v7.0.20 published `KalderaShield-7.0.20-1.x86_64.rpm.sig` with no `.rpm`
 * next to it. The collect step copied signatures by suffix from the bundle
 * tree, and Tauri builds the RPM in-process via the `rpm` crate, so the package
 * was sitting in `bundle/rpm/` the whole time -- only the collect step never
 * looked for it. The signature was the *only* RPM artifact on the release, and
 * it verified nothing.
 *
 * An orphaned signature is worse than a missing one. A missing file is a gap
 * the user can see; a signature that cannot verify looks like a safety
 * guarantee and is not one. This turns that into a failed run.
 *
 * Kept as a script rather than inline shell because shell in a workflow is only
 * tested by a failing release, and the test below extracts this same script
 * from the workflow rather than keeping its own copy.
 *
 * Usage: node scripts/verify-signature-payloads.cjs --dir release-local/linux
 */
const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = { dir: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') {
      args.dir = argv[i + 1];
      i++;
    }
  }
  return args;
}

function main() {
  const { dir } = parseArgs(process.argv.slice(2));
  if (!dir) {
    console.error('usage: verify-signature-payloads.cjs --dir <release directory>');
    return 2;
  }
  if (!fs.existsSync(dir)) {
    console.error(`directory not found: ${dir}`);
    return 2;
  }

  const signatures = fs.readdirSync(dir).filter(file => file.endsWith('.sig'));
  const orphaned = signatures.filter(sig => !fs.existsSync(path.join(dir, sig.slice(0, -'.sig'.length))));

  if (orphaned.length > 0) {
    console.error(`::error::${orphaned.length} orphaned signature(s) with no payload in ${dir}`);
    for (const sig of orphaned) {
      console.error(`::error::  ${sig} has no ${sig.slice(0, -'.sig'.length)}`);
    }
    return 1;
  }

  console.log(`Signature payload check passed: ${signatures.length} signature(s) in ${dir} all have a payload.`);
  return 0;
}

process.exit(main());