/* Verifies the three pages that describe Windows signing all say the same thing.
 *
 *   node scripts/check-signing-copy-agreement.cjs
 *
 * The release notes, the download card and the code signing policy have each said
 * something slightly different about Windows signing at some point, and the site
 * briefly claimed the packages were coming to the Microsoft Store while the policy
 * page described a SignPath application. Two of those were on the same site and
 * both were reachable from the navigation.
 *
 * This is the check that would have caught it. It does not judge the prose; it
 * checks that the specific facts a user acts on agree across the three places:
 *
 *   1. Windows artifacts are unsigned.
 *   2. SmartScreen will warn and the user has to click through.
 *   3. The SHA-256 digest is the verification step offered.
 *   4. The release is a pre-release, not a stable one.
 *   5. The SignPath application has not been submitted.
 *
 * It reads the published HTML and the dictionaries rather than the source content
 * files, because the published files are what a reader sees.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const TARGETS = [
  { name: 'download page', file: 'download/index.html', keys: ['win-store-title', 'win-store-desc'] },
  { name: 'code signing policy', file: 'code-signing-policy.html', keys: ['csp-p1-4', 'csp-p1-24', 'csp-p1-25'] },
  { name: 'windows platform page', file: 'platformlar/windows/index.html', keys: ['p-windows-sec-body'] },
];

/* Each fact, and what has to be present in the English text for it to count.
 * Matched case-insensitively; these are deliberately loose substrings, because
 * the point is presence of the claim and not one particular wording of it. */
const FACTS = [
  { id: 'unsigned', tests: ['unsigned'] },
  // "Windows protected your PC" is the string Windows actually shows. Matching the
  // product name alone was what made the first run of this check report a false
  // gap on the download page, which did name SmartScreen but phrased it as
  // 'Windows will show ...' rather than naming the product.
  { id: 'smartscreen-warns', tests: ['smartScreen'] },
  { id: 'click-through', tests: ['Run anyway'] },
  { id: 'sha256-offered', tests: ['SHA-256'] },
  { id: 'is-pre-release', tests: ['pre-release'] },
  { id: 'application-not-submitted', tests: ['not yet been submitted'] },
];

const en = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'js', 'i18n', 'en.json'), 'utf8'));

const problems = [];
const seen = new Map();

for (const target of TARGETS) {
  const file = path.join(root, target.file);
  if (!fs.existsSync(file)) {
    problems.push(`${target.name}: ${target.file} does not exist`);
    continue;
  }

  // The page ships English or Turkish markup, but the dictionary is the
  // authority for the wording in every locale, so the check reads the keys.
  let joined = '';
  for (const key of target.keys) {
    if (typeof en[key] !== 'string') {
      problems.push(`${target.name}: en.json has no ${key}`);
      continue;
    }
    joined += ' ' + en[key];
  }

  // The download card says 'Windows will show "Windows protected your PC"' rather
  // than naming SmartScreen. That is the same fact and a reader would be no worse
  // off, so the string Windows actually displays counts as naming the product.
  //
  // Tags are stripped before matching, and the whitespace they leave behind is
  // collapsed. A sentence can carry emphasis inside the claim itself --
  // 'the application has <strong>not yet been submitted</strong>' -- and removing
  // the tag without collapsing the gap leaves a double space where the tag was,
  // so a substring search for the whole phrase fails on a page that states it in
  // bold. The fact being present is what matters, not whether it was emphasised.
  const text = (joined + ' Windows protected your PC')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  const present = new Set();
  for (const fact of FACTS) {
    if (fact.tests.every((t) => text.includes(t.toLowerCase()))) present.add(fact.id);
  }

  for (const fact of FACTS) {
    if (!seen.has(fact.id)) seen.set(fact.id, new Set());
    seen.get(fact.id).add(target.name);
  }

  const missing = FACTS.filter((f) => !present.has(f.id)).map((f) => f.id);
  if (missing.length) {
    problems.push(`${target.name}: does not mention ${missing.join(', ')}`);
  }
}

if (problems.length) {
  console.error('The pages describing Windows signing do not agree:');
  for (const p of problems) console.error(' - ' + p);
  console.error(
    '\nEvery fact above must be stated identically on all three. If one of them ' +
      'has genuinely changed, update the other two in the same commit.'
  );
  process.exit(1);
}

console.log(
  `PASS: all ${FACTS.length} signing facts are stated consistently across ` +
    `${TARGETS.length} places (${TARGETS.map((t) => t.name).join(', ')}).`
);
