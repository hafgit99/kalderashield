/* Read-modify-write for a text or JSON file, through a file descriptor.
 *
 *   const { updateFile, updateJsonFile } = require('./lib/safe-file.cjs');
 *   updateJsonFile(dictionaryPath, (dict) => { dict[key] = value; });
 *   updateFile(indexPath, (html) => html.replace(old, next));
 *
 * Why this exists rather than `readFileSync` then `writeFileSync`
 * -------------------------------------------------------------
 * CodeQL flagged the pattern as `js/file-system-race` (CWE-367). Between the
 * read and the write the file is addressed by name, so anything that can reach
 * that directory could substitute a different file in between — and these are
 * the site's dictionaries and pages, which everything else is generated from.
 *
 * That threat model does not really apply here: these scripts run in a
 * developer's checkout of a public repository, and an attacker who could write
 * to that directory could edit the page generator instead. Refuting the finding
 * was not the interesting option anyway. There was no reason to name the file
 * twice, and one descriptor removes the window without arguing about it: the
 * descriptor is opened once, so the bytes that are read and the bytes that are
 * written are the same file by construction, and a rename or a swap in between
 * changes nothing because nothing is looked up twice.
 *
 * `truncate` before the write, and an explicit write position, because the
 * descriptor is still positioned at the end of what it read. Skipping either
 * leaves the tail of the old content after the new content — for a JSON file
 * that still parses, because JSON stops at the first closing brace, so a
 * dictionary quietly loses every key after the edit point and the i18n audit
 * reports the loss as an ordinary translation gap somewhere else entirely.
 * `test-safe-file.cjs` covers exactly that.
 *
 * A transform that returns the input unchanged, or nothing, writes nothing, so
 * a script run twice on a tree that is already up to date produces no diff.
 */
const fs = require('fs');

/**
 * Read a text file, transform it, and write it back through one descriptor.
 *
 * @param {string} file                    Path to the file. Must exist.
 * @param {(text: string) => string | undefined} transform
 *        Receives the file contents and returns the replacement, or a falsy
 *        value to leave the file untouched.
 * @returns {boolean} true when the file was rewritten.
 */
function updateFile(file, transform) {
  const fd = fs.openSync(file, 'r+');
  try {
    const current = fs.readFileSync(fd, 'utf8');
    const next = transform(current);
    if (!next || next === current) return false;

    fs.ftruncateSync(fd, 0);
    fs.writeSync(fd, next, 0, 'utf8');
    return true;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Parse a JSON file, mutate the document, and write it back through one
 * descriptor, keeping the two-space-plus-newline shape every dictionary uses.
 *
 * A falsy return from `mutate` leaves the file untouched, which is how a caller
 * says "nothing to change" without having to know whether the file was opened.
 *
 * @param {string} file             Path to the JSON file. Must exist.
 * @param {(value: any) => any} mutate
 * @returns {boolean} true when the file was rewritten.
 */
function updateJsonFile(file, mutate) {
  return updateFile(file, (text) => {
    const document = JSON.parse(text);
    const next = mutate(document);
    return next ? `${JSON.stringify(next, null, 2)}\n` : undefined;
  });
}

module.exports = { updateFile, updateJsonFile };