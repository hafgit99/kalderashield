/**
 * Adds the code signing policy link to the home page footer, in all twelve
 * languages.
 *
 *   node scripts/apply-home-csp-link-i18n.cjs
 *
 * SignPath Foundation's terms: "A code signing policy must be specified on the
 * project's home page. Use the term 'Code signing policy' on your project's
 * home page and download/release pages."
 *
 * The policy page existed in twelve languages and the download page linked to
 * it in twelve languages; the home page did not link to it at all, in any
 * language. A reviewer arriving at the project home and finding no route to
 * the policy reads that as the policy not existing, which is the opposite of
 * what is true here.
 *
 * It goes in the "Legal" column next to the privacy policy and terms, because
 * that is where a reader looking for "what is this, and who stands behind it"
 * already looks. The English wording carries the required term verbatim; the
 * other eleven translate it, which is what the term is for.
 */
const path = require('path');

const { updateFile, updateJsonFile } = require('./lib/safe-file.cjs');

const root = path.resolve(__dirname, '..');
const I18N = path.join(root, 'assets', 'js', 'i18n');
const PAGE = path.join(root, 'index.html');

const KEY = 'footer-link-code-signing';

const TEXT = {
  tr: 'Kod İmza Politikası',
  en: 'Code signing policy',
  de: 'Richtlinie zur Code-Signierung',
  fr: 'Politique de signature de code',
  es: 'Política de firma de código',
  it: 'Informativa sulla firma del codice',
  pt: 'Política de assinatura de código',
  ru: 'Политика подписания кода',
  ja: 'コード署名ポリシー',
  zh: '代码签名政策',
  ko: '코드 서명 정책',
  ar: 'سياسة توقيع الكود',
};

let dictionaries = 0;
const problems = [];

for (const [locale, value] of Object.entries(TEXT)) {
  const file = path.join(I18N, `${locale}.json`);
  updateJsonFile(file, (dict) => {
    if (typeof dict['footer-link-privacy'] !== 'string') {
      throw new Error(`${locale}.json footer-link-privacy yok`);
    }
    dict[KEY] = value;
    return dict;
  });
  dictionaries++;
}

let paragraphs = 0;
updateFile(PAGE, (page) => {
  if (page.includes(`data-i18n="${KEY}"`)) return undefined;

  const link = new RegExp(`(<li><a href="/privacy\\.html" data-i18n="footer-link-privacy">[^<]*</a></li>)`);
  if (!link.test(page)) {
    problems.push('index.html: footer-link-privacy baglantisi bulunamadi');
    return undefined;
  }

  paragraphs++;
  return page.replace(
    link,
    `$1\n<li><a href="/code-signing-policy.html" data-i18n="${KEY}">${TEXT.tr}</a></li>`
  );
});

if (problems.length) {
  console.error('uygulanamadi:');
  problems.forEach((p) => console.error(`  ${p}`));
  process.exit(1);
}

console.log(`${dictionaries} sozluk, ${paragraphs} sayfa baglantisi guncellendi.`);
console.log('Simdi: node scripts/generate-locales.cjs');