/* The site's canonical identity, read from site.config.json.
 *
 * The domain used to live in a `{{DOMAIN}}` token that every script repeated and
 * every page carried. That is 8948 occurrences across 306 files, and a value
 * that is written out that many times is a value that cannot be changed: finding
 * them all is a search, and forgetting one is a canonical URL that points
 * somewhere the site does not live. It is also why the placeholder gate existed,
 * which is a check that exists only to catch a mistake of this shape.
 *
 * So the domain is written once, here, and the generators substitute it on the
 * way out. Nothing in the shipped tree holds a placeholder, so there is nothing
 * left to forget.
 *
 * A missing or malformed config throws here rather than at the point of use. A
 * generator that silently emitted an empty domain would produce pages that build
 * cleanly and rank nowhere.
 */
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, '..', '..', 'site.config.json');

let raw;
try {
  raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (err) {
  throw new Error(`site.config.json could not be read (${CONFIG_PATH}): ${err.message}`);
}

/* A hostname is the part that has to be right, so it is checked rather than
 * assumed. `https://kalderashield.com/` and `kalderashield.com/evil` both sail
 * through a naive concatenation, and the first one silently breaks every
 * canonical URL on the site. */
const DOMAIN = raw.domain;
if (typeof DOMAIN !== 'string' || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(DOMAIN)) {
  throw new Error(`site.config.json: "domain" must be a bare hostname, got ${JSON.stringify(raw.domain)}`);
}

if (typeof raw.brand !== 'string' || !raw.brand) {
  throw new Error('site.config.json: "brand" is required');
}

for (const key of ['admin', 'security']) {
  const address = raw.email && raw.email[key];
  if (typeof address !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new Error(`site.config.json: "email.${key}" must be an address, got ${JSON.stringify(address)}`);
  }
  /* An address on someone else's domain is worse than a missing one, because it
   * looks finished. The site only ever publishes its own. */
  if (address.slice(address.lastIndexOf('@') + 1).toLowerCase() !== DOMAIN.toLowerCase()) {
    throw new Error(`site.config.json: "email.${key}" must be on @${DOMAIN}, got ${address}`);
  }
}

const ORIGIN = `https://${DOMAIN}`;
const BRAND = raw.brand;
const REPOSITORY = raw.repository;
const ADMIN_EMAIL = raw.email.admin;
const SECURITY_EMAIL = raw.email.security;

/* The one place the legal pages' contact link is written, so a change to the
 * address is a change to this constant and not to twelve dictionaries. */
const MAILTO_ADMIN = `<a href="mailto:${ADMIN_EMAIL}">${ADMIN_EMAIL}</a>`;
const MAILTO_SECURITY = `<a href="mailto:${SECURITY_EMAIL}">${SECURITY_EMAIL}</a>`;

module.exports = {
  DOMAIN,
  ORIGIN,
  BRAND,
  REPOSITORY,
  ADMIN_EMAIL,
  SECURITY_EMAIL,
  MAILTO_ADMIN,
  MAILTO_SECURITY,
};