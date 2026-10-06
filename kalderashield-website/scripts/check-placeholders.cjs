#!/usr/bin/env node
/* Deploy gate: the shipped tree must carry no unfilled placeholder, and the
 * identity it does carry must be the one in site.config.json.
 *
 * The gate this replaces failed on two things at once and could never pass:
 * `{{DOMAIN}}` in the pages, and `{{VERSION}}` in the twelve dictionaries, which
 * is a token the browser substitutes from data-site-version and which is
 * supposed to be there. A gate that reports a real problem next to a
 * non-problem trains people to read past its output, so the two are separated
 * here by what actually gets substituted.
 *
 *   - {{DOMAIN}} has no runtime substituter. Nothing replaces it, so any
 *     occurrence outside a build template is a bug and is reported.
 *   - {{VERSION}} and {{TESTCOUNT}} are substituted by assets/js/i18n-apply.js
 *     from the document. They are allowed in the dictionaries and the apply
 *     script, and reported in shipped HTML, where nothing would replace them.
 *
 * It also checks the identity rather than only the absence of placeholders. A
 * canonical URL pointing at a domain the site does not serve is the same defect
 * as {{DOMAIN}}, it is just spelled differently, and "no token present" would
 * not catch it.
 */
const fs = require('fs');
const path = require('path');

const { DOMAIN, ORIGIN, ADMIN_EMAIL, SECURITY_EMAIL } = require('./lib/site-config.cjs');

const root = path.resolve(__dirname, '..');

/* Directories that are inputs to a build rather than output of one. The template
 * legitimately holds {{DOMAIN}} because build-pages.cjs substitutes it, and
 * scripts/ holds the string as a value to compare against. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'scripts', 'templates']);

/* README.md documents this gate, so it necessarily names the token it looks for.
 * Excluding the whole file would also stop the gate reading the deploy notes,
 * so the token check is skipped for it alone and the identity checks below still
 * run. */
const TOKEN_NARRATION_OK = new Set(['README.md']);

function collect(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(rel, out);
    else if (/\.(html|js|css|json|txt|xml|webmanifest|md|sh)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const findings = [];

/* A foreign absolute host, as opposed to a path. Compared against a leading
 * "//" or "https://" so an ordinary relative link cannot match, and a github.com
 * or apache.org URL in the license block is not a finding. */
function foreignOrigin(text) {
  const found = new Set();
  const re = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const host = m[1].toLowerCase();
    if (host !== DOMAIN && !host.endsWith('.' + DOMAIN)) found.add(host);
  }
  return [...found];
}

const ALLOWED_HOSTS = new Set([
  'github.com',
  'www.apache.org',
  'www.w3.org',
  'www.sitemaps.org',
]);

for (const file of collect(root)) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(root, file).replace(/\\/g, '/');

  if (text.includes('{{DOMAIN}}') && !TOKEN_NARRATION_OK.has(rel)) {
    findings.push(`${rel}: unfilled {{DOMAIN}} token (nothing substitutes it at runtime)`);
  }

  /* The version and test-count tokens are replaced in the browser, so they are
   * only a defect in markup, which the browser will never post-process. */
  if (rel.endsWith('.html') && /\{\{(?:VERSION|TESTCOUNT)\}\}/.test(text)) {
    findings.push(`${rel}: runtime token in shipped markup, which nothing substitutes`);
  }

  /* Scoped to what a visitor receives. README.md and UYGULAMA_PLANI.md discuss
   * the AegisVault lessons the site was rebuilt from, and rewriting those
   * references would delete the reasoning rather than fix a defect -- but the
   * same string in a page or a dictionary is a rebrand that did not finish. */
  if (!rel.endsWith('.md') && /aegis/i.test(text)) {
    findings.push(`${rel}: "Aegis" remnant in published output (rebrand incomplete)`);
  }

  for (const host of foreignOrigin(text)) {
    if (ALLOWED_HOSTS.has(host) || host.endsWith('.github.com')) continue;
    findings.push(`${rel}: absolute URL on ${host}, not ${DOMAIN}`);
  }
}

/* The config's own values have to reach the files that publish them. A domain
 * that is set but not wired into security.txt is a contact address that goes
 * nowhere, which is the exact failure the placeholder used to cause. */
function requireContains(rel, needle, why) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    findings.push(`${rel}: missing, so ${why} cannot be published`);
    return;
  }
  if (!fs.readFileSync(file, 'utf8').includes(needle)) {
    findings.push(`${rel}: does not contain ${needle} (${why})`);
  }
}

requireContains('robots.txt', `Sitemap: ${ORIGIN}/sitemap.xml`, 'the sitemap address');
requireContains('install.sh', `${ORIGIN}/install.sh`, 'the installer URL');
requireContains('.well-known/security.txt', `mailto:${SECURITY_EMAIL}`, 'the security contact');
requireContains('privacy.html', ADMIN_EMAIL, 'the privacy contact');
requireContains('terms.html', ADMIN_EMAIL, 'the terms contact');

/* Every dictionary must agree on the contact address, since each is a separate
 * file and one left behind is a page that renders the old address. */
const i18nDir = path.join(root, 'assets', 'js', 'i18n');
for (const name of fs.readdirSync(i18nDir)) {
  if (!name.endsWith('.json')) continue;
  const text = fs.readFileSync(path.join(i18nDir, name), 'utf8');
  if (text.includes(ADMIN_EMAIL)) continue;
  const legal = /privacy-p1-6|terms-p1-8/.test(text);
  if (legal) findings.push(`assets/js/i18n/${name}: legal copy has no ${ADMIN_EMAIL}`);
}

if (findings.length) {
  console.error('Placeholder gate failed:');
  for (const f of findings) console.error(' -', f);
  process.exit(1);
}
console.log(
  `PASS: no unfilled placeholders; every absolute URL is on ${DOMAIN}; ` +
  `robots.txt, install.sh, security.txt and both legal pages carry the configured contacts.`
);