#!/usr/bin/env node
/* Single entry point for building and verifying kalderashield-website.
 *
 *   node kalderashield-website/scripts/run-site-pipeline.cjs build
 *   node kalderashield-website/scripts/run-site-pipeline.cjs check
 *   node kalderashield-website/scripts/run-site-pipeline.cjs check --with-browser
 */
const { execFileSync } = require('child_process');
const path = require('path');

const siteRoot = path.resolve(__dirname, '..');
const mode = process.argv[2] || 'check';
const withBrowser = process.argv.includes('--with-browser');

const BUILD_STEPS = [
  ['scripts/build-pages.cjs'],
  ['scripts/add-comparison-cell-i18n.cjs'],
  ['scripts/add-cta-i18n.cjs'],
  ['scripts/fix-faq-path-placeholder.cjs'],
  ['scripts/rewrite-comparison-table.cjs'],
  ['scripts/sync-claims.cjs'],
  ['scripts/sync-security-claims.cjs'],
  ['scripts/sync-head-meta.cjs'],
  ['scripts/sync-script-tags.cjs'],
  ['scripts/generate-locales.cjs'],
  ['scripts/generate-sitemap.cjs'],
  ['scripts/build-chrome-dictionary.cjs'],
];

const CHECK_STEPS = [
  ['scripts/check-placeholders.cjs'],
  ['scripts/check-signing-copy-agreement.cjs'],
  ['scripts/audit-home-keys.cjs'],
  ['scripts/audit-header-nav.cjs'],
  ['scripts/audit-page-packs.cjs'],
  ['scripts/audit-translation-scripts.cjs'],
  ['scripts/audit-page-meta.cjs'],
  ...(withBrowser
    ? [
        ['scripts/audit-contrast.cjs'],
        ['scripts/audit-hero-metrics.cjs'],
      ]
    : []),
  ['scripts/sync-claims.cjs', '--check'],
  ['scripts/sync-security-claims.cjs', '--check'],
  ['scripts/sync-head-meta.cjs', '--check'],
  ['scripts/sync-script-tags.cjs', '--check'],
  ['scripts/measure-locale-coverage.cjs'],
  ['scripts/audit-orphan-keys.cjs'],
  ['scripts/audit-local-assets.cjs'],
  ['scripts/audit-turkish-copy.cjs'],
  ['scripts/audit-static-i18n.cjs'],
  ['scripts/audit-locale-links.cjs'],
];

const list = mode === 'build' ? BUILD_STEPS : CHECK_STEPS;
for (const args of list) {
  console.log(`\n==> node ${args.join(' ')}`);
  execFileSync(process.execPath, args, { cwd: siteRoot, stdio: 'inherit' });
}
console.log(`\nSite pipeline (${mode}) completed successfully.`);
