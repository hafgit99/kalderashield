/* Rewrites the Windows signing paragraph in its source of truth.
 *
 *   node scripts/apply-windows-sec-body-source.cjs
 *
 * Why this file exists. p-windows-sec-body reaches the built pages through
 * content/pages/13-windows.json, not through the locale JSON files. build-pages.cjs
 * harvests it from there and writes it into every locale. Editing en.json directly
 * therefore does not change the page -- the next build overwrites it, and CI's
 * "generated site output is out of date" gate fires on the diff. That is exactly
 * what happened once: the wording was changed in the wrong file and the gate
 * caught it.
 *
 * Only en and tr live in the content file. The other ten locales are written
 * straight into assets/js/i18n/*.json and are not harvested, so they are handled
 * by apply-windows-preview-platform-live-i18n.cjs. Both must say the same thing.
 *
 * The paragraph keeps the phrase "not yet been submitted" verbatim in English,
 * because check-signing-copy-agreement.cjs looks for it by that text to confirm
 * all three pages agree about the SignPath application state.
 */
const fs = require('fs');
const path = require('path');

const CONTENT = path.resolve(__dirname, '..', 'content', 'pages', '13-windows.json');

const BODY = {
  en: 'Windows installers are published as an <strong>unsigned preview</strong> and carry no Authenticode signature. There is no signing certificate: the release pipeline treats an unsigned desktop release as a failure, so the preview is marked as a <em>pre-release</em> and <code>latest</code> does not point at it. Unsigned files trigger the Windows SmartScreen "Windows protected your PC" warning, and you must click "More info" → "Run anyway" to run the installer; this is expected. Verify the SHA-256 digest against SHA256SUMS.txt before installing. An application to the SignPath Foundation for free open-source signing <strong>has not yet been submitted</strong>; once signing is available, subsequent releases will be signed and this warning goes away.',
  tr: 'Windows kurucuları <strong>imzasız önizleme</strong> olarak yayımlanmıştır ve Authenticode imzası taşımaz. İmza sertifikası yok: sürüm hattı imzasız bir masaüstü sürümünü hata sayar, bu yüzden önizleme <em>ön sürüm</em> olarak işaretlenir ve <code>latest</code> ona işaret etmez. İmzalanmamış dosyalarda Windows SmartScreen "PC\'niz korundu" uyarısı gösterir ve kurulumu çalıştırmak için "Daha fazla bilgi" → "Yine de çalıştır" demeniz gerekir; bu beklenen bir durumdur. Kurmadan önce SHA-256 karmasını SHA256SUMS.txt ile doğrulayın. İmzalama için SignPath Foundation programına başvuru <strong>henüz gönderilmemiştir</strong>; imza sağlandığında sonraki sürümler imzalanacak ve bu uyarı kalkacak.',
};

const json = JSON.parse(fs.readFileSync(CONTENT, 'utf8'));

if (!json.i18n || !json.i18n.en || !json.i18n.tr) {
  console.error('content/pages/13-windows.json has no i18n.en / i18n.tr to update.');
  process.exit(1);
}

for (const code of ['en', 'tr']) {
  if (json.i18n[code].secBody === BODY[code]) continue;
  json.i18n[code].secBody = BODY[code];
  console.log(`updated ${code}.secBody`);
}

fs.writeFileSync(CONTENT, JSON.stringify(json, null, 2) + '\n', 'utf8');
console.log('wrote ' + path.relative(path.resolve(__dirname, '..', '..'), CONTENT));