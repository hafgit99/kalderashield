#!/usr/bin/env node
/* Measures the hero title's line box in a real browser, on every family the
 * system font stack can resolve to.
 *
 *   node scripts/audit-hero-metrics.cjs
 *
 * ── What it closes ──────────────────────────────────────────────────────────
 *
 * The homepage title reads "Your Data Stays Safe On Your Device Only." with the
 * last four words in `.gradient-text`. It was set at `line-height: 1.08`, which
 * is *tighter than the font's own line box*: the element box was shorter than
 * the glyphs inside it.
 *
 * That is invisible while nothing clips, which is why it survived. The hero
 * title is the only heading on this site set in a system stack rather than a
 * webfont, so which family a visitor gets is decided by their operating system
 * and not by this stylesheet. Measured overflow at 1.08:
 *
 *   Segoe UI / system-ui (Windows)   6px above the box, 4px below
 *   Verdana, Tahoma                   4px above, 2px below
 *   Arial, Georgia, Courier New      2px above
 *   Times New Roman                  1px above
 *
 * Windows is the worst case and the largest overflow. On a machine that clips
 * -- a different font on the box, an `overflow: hidden` added to a parent, a
 * taller natural line box -- the descenders of the last word go. That is what a
 * half-rendered letter in "Only" looks like, and it is the kind of report that
 * is impossible to reproduce from the source by reading.
 *
 * This measures it the only way the question can be answered: render it, and
 * compare the union of the text's client rects against the element's own box.
 *
 * `audit-contrast.cjs` already runs a real Chromium in CI, so this sits beside
 * it rather than inventing a second browser dependency.
 */
const path = require('path');
const { createServer } = require('http');
const fs = require('fs');

/* Playwright lives in the repository root, not next to this script. Resolved by
 * path rather than by bare `require('playwright')` because Node walks up from
 * this file's directory, and `kalderashield-website/node_modules` does not
 * exist. */
const ROOT = path.join(__dirname, '..');
const REPO_ROOT = path.join(ROOT, '..');
const { chromium } = require(path.join(REPO_ROOT, 'node_modules', 'playwright'));

const PORT = Number(process.env.HERO_AUDIT_PORT || 4399);
const URL = `http://127.0.0.1:${PORT}`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.vtt': 'text/vtt; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/* Every family the `--font` stack can land on, plus the extremes of the two
 * axes that matter: a tall humanist sans (Segoe UI, the Windows default) and a
 * wide one (Verdana). A gate that only tested one would pass on the machines
 * that are not the broken one. */
const FAMILIES = [
  ['system-ui', 'system-ui'],
  ['Segoe UI', '"Segoe UI"'],
  ['Arial', 'Arial'],
  ['Verdana', 'Verdana'],
  ['Tahoma', 'Tahoma'],
  ['Georgia', 'Georgia'],
  ['Times New Roman', '"Times New Roman"'],
  ['Courier New', '"Courier New"'],
];

/* The English hero title is the longest of the twelve: the Turkish original is
 * one line at desktop width and the longest locale wraps to two. Two lines is
 * the case that matters, because the overflow shows at both ends. */
const PAGES = ['/', '/en/', '/de/'];
const WIDTHS = [1280, 900, 600];

async function main() {
  const server = createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const full = path.join(ROOT, p);
    if (!fs.existsSync(full)) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  });

  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await chromium.launch();
  const failures = [];
  let measurements = 0;

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${URL}/en/`, { waitUntil: 'networkidle' });

    for (const [label, family] of FAMILIES) {
      await page.addStyleTag({ content: `.hero h1{font-family:${family} !important;}` });
      await page.waitForTimeout(40);

      for (const p of PAGES) {
        await page.goto(`${URL}${p}`, { waitUntil: 'networkidle' });
        // The style tag does not survive navigation; re-apply per page.
        await page.addStyleTag({ content: `.hero h1{font-family:${family} !important;}` });
        await page.waitForTimeout(40);

        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForTimeout(40);

          const result = await page.evaluate(() => {
            const h1 = document.querySelector('.hero h1');
            if (!h1) return null;
            const range = document.createRange();
            range.selectNodeContents(h1);
            const rects = [...range.getClientRects()];
            if (rects.length === 0) return null;
            const box = h1.getBoundingClientRect();
            return {
              above: Math.round(box.top - rects[0].top),
              below: Math.round(rects[rects.length - 1].bottom - box.bottom),
              lines: rects.length,
            };
          });

          if (!result) continue;
          measurements += 1;

          if (result.above > 0 || result.below > 0) {
            failures.push(
              `${p} @${width}px · ${label}: metin kutunun ${result.above}px üstü / ${result.below}px altı dışarıda taşıyor (${result.lines} satır)`
            );
          }
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`Sayfa x genişlik x yazı tipi ölçümü: ${measurements}`);
  console.log(`Kutu dışına taşan: ${failures.length}`);

  if (failures.length) {
    console.error('\nDurum: FAIL — hero başlığının satır kutusu kendi harflerini içermiyor.');
    for (const f of failures) console.error(`  FAIL ${f}`);
    console.error('\nBu, bir ebeveyn overflow eklediğinde ya da farklı bir işletim');
    console.error('sisteminde son satırın iniş harflerinin kırpılmasına yol açar.');
    console.error('line-height / padding-block değerlerini .hero h1 kuralında düzeltin.');
    process.exit(1);
  }

  console.log('\nDurum: PASS — hero başlığının kutusu, yığın çözülebileceği her yazı tipinde kendi satırlarını içeriyor.');
}

main();