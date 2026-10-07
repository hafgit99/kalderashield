/* Shared writer for the code signing policy translations.
 *
 *   require('./lib/signpath-policy-i18n.cjs')
 *
 * Both apply-signpath-policy-i18n.cjs and its non-Latin sibling write the same
 * shape of data into the same twelve dictionaries. The part worth sharing is the
 * write loop, because the bug it prevents is the one this page cannot survive: a
 * key landing in eleven of twelve files. Nothing about that is visible on the
 * page, and the key-parity audit only checks keys the base dictionary already has
 * -- so the missing eleventh language reads as a finished translation until
 * someone opens the site in that language and finds Turkish.
 *
 * Hence the two rules below. A locale missing any key is reported and the exit
 * code is non-zero, and a value that is empty or still equal to the key is
 * refused rather than written, because both are the same silent failure wearing a
 * different hat.
 */
const fs = require('fs');
const path = require('path');

function apply(i18nDir, codes, translations) {
  let written = 0;
  const problems = [];

  for (const code of codes) {
    const file = path.join(i18nDir, code + '.json');
    let json;
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      problems.push(`${code}.json could not be read: ${err.message}`);
      continue;
    }

    for (const [key, byLanguage] of Object.entries(translations)) {
      const value = byLanguage[code];
      if (typeof value !== 'string' || value.trim() === '') {
        problems.push(`${code} is missing ${key}`);
        continue;
      }
      // A value identical to its own key means the translation was never filled
      // in and the placeholder slipped through. Same for a key holding its own
      // name, which is what a partially-edited table tends to leave behind.
      if (value === key) {
        problems.push(`${code} has ${key} set to its own key`);
        continue;
      }
      json[key] = value;
      written++;
    }

    // 2-space indent is what the existing locale files already use, so the
    // diff this produces is the new keys and nothing else.
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
  }

  console.log(`applied ${written} values across ${codes.length} locales`);
  if (problems.length) {
    problems.forEach((p) => console.log('  MISSING ' + p));
    process.exitCode = 1;
  }
}

module.exports = { apply };
