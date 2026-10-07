/* Points the download card and the Windows platform page at the published preview.
 *
 *   node scripts/apply-windows-preview-live-i18n.cjs
 *
 * Run this only AFTER the preview release exists on GitHub. The previous
 * scripts said the preview was forthcoming; these say it is there, with the tag,
 * the three artifact names and the warning that has to travel with them.
 *
 * Why the download card gains a link rather than a download button: the artifacts
 * are on GitHub Releases, not hosted here, and a button that looked like a normal
 * download would hide that the file is unsigned. The link text carries the word
 * "unsigned" so nobody can reach the file without having been told.
 */
const fs = require('fs');
const path = require('path');

const { apply } = require('./lib/signpath-policy-i18n.cjs');

const I18N_DIR = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');
const CODES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'tr', 'zh'];

const TAG = 'v7.0.20-unsigned-preview';
const RELEASES =
  'https://github.com/hafgit99/kalderashield/releases/tag/' + TAG;

const TRANSLATIONS = {
  'win-store-title': {
    tr: 'İmzasız Önizleme — Yayımlandı',
    en: 'Unsigned preview — published',
    de: 'Unsignierte Vorschau — veröffentlicht',
    fr: 'Aperçu non signé — publié',
    es: 'Vista previa sin firmar — publicada',
    it: 'Anteprima non firmata — pubblicata',
    pt: 'Pré-visualização sem assinatura — publicada',
    ru: 'Неподписанная предварительная сборка — опубликована',
    ar: 'إعاينة غير موقَّعة — منشورة',
    ja: '未署名プレビュー — 公開済み',
    ko: '서명 없는 미리보기 — 게시됨',
    zh: '未签名预览 — 已发布',
  },

  'win-store-desc': {
    tr: '<strong>Bu dosyalar imzalı değildir.</strong> Windows SmartScreen "PC\'niz korundu" uyarısı gösterecek ve kurulumu çalıştırmak için "Daha fazla bilgi" → "Yine de çalıştır" demeniz gerekecek. Bu beklenen bir durumdur ve kötü amaçlı yazılım anlamına gelmez. Çalıştırmadan önce SHA-256 karmasını SHA256SUMS.txt ile doğrulayın. Bu bir <em>ön sürümdür</em>: kararlı sürüm değildir ve <code>latest</code> ona işaret etmez. Neden imzasız olduğu: sürüm hattı imzasız bir masaüstü sürümünü hata sayar, bu yüzden şimdilik imzalayacak bir sertifika yok. SignPath Foundation programına başvuru hazırlandı ama henüz gönderilmedi. İmza sağlandığında sonraki Windows sürümleri imzalanacak ve bu uyarı kaldırılacak.',
    en: '<strong>These files are not signed.</strong> Windows SmartScreen will show "Windows protected your PC" and you must click "More info" → "Run anyway" to run the installer. This is expected and it does not mean the file is malware. Verify the SHA-256 digest against SHA256SUMS.txt before running it. This is a <em>pre-release</em>: not a stable release, and <code>latest</code> does not point at it. Why unsigned: the release pipeline treats an unsigned desktop release as a failure, so there is no certificate to sign with yet. An application to the SignPath Foundation has been prepared but not submitted. When signing is available, subsequent Windows releases will be signed and this warning will be removed.',
    de: '<strong>Diese Dateien sind nicht signiert.</strong> Windows SmartScreen zeigt "Der PC ist geschützt", und Sie müssen auf "Weitere Informationen" → "Trotzdem ausführen" klicken, um das Installationsprogramm zu starten. Das ist erwartet und bedeutet nicht, dass die Datei Schadsoftware ist. Prüfen Sie vor dem Start die SHA-256-Prüfsumme gegen SHA256SUMS.txt. Dies ist eine <em>Vorabversion</em>: kein stabiles Release, und <code>latest</code> zeigt nicht darauf. Warum unsigniert: Die Release-Pipeline behandelt ein unsigniertes Desktop-Release als Fehler, es gibt also noch kein Zertifikat zum Signieren. Eine Bewerbung beim SignPath Foundation ist vorbereitet, aber noch nicht eingereicht. Sobald Signieren möglich ist, werden nachfolgende Windows-Versionen signiert und dieser Hinweis entfernt.',
    fr: "<strong>Ces fichiers ne sont pas signés.</strong> Windows SmartScreen affichera « Votre PC est protégé » et vous devrez cliquer sur « Informations » → « Exécuter quand même » pour lancer l'installeur. C'est attendu et cela ne signifie pas que le fichier est un logiciel malveillant. Vérifiez la somme SHA-256 dans SHA256SUMS.txt avant de l'exécuter. Ceci est une <em>préversion</em> : pas une version stable, et <code>latest</code> ne pointe pas dessus. Pourquoi non signé : la chaîne de publication traite une version de bureau non signée comme un échec, il n'y a donc pas encore de certificat de signature. Une candidature auprès de la SignPath Foundation a été préparée mais pas encore déposée. Dès que la signature sera possible, les versions Windows suivantes seront signées et cet avertissement supprimé.",
    es: '<strong>Estos archivos no están firmados.</strong> Windows SmartScreen mostrará "Tu PC está protegido" y tendrás que hacer clic en "Más información" → "Ejecutar de todas formas" para ejecutar el instalador. Es lo esperado y no significa que el archivo sea malware. Verifica el resumen SHA-256 en SHA256SUMS.txt antes de ejecutarlo. Esta es una <em>versión preliminar</em>: no es una versión estable, y <code>latest</code> no apunta a ella. Por qué sin firmar: la cadena de publicación trata una versión de escritorio sin firmar como un fallo, así que todavía no hay certificado con el que firmar. Se ha preparado una solicitud al programa de SignPath Foundation pero no se ha enviado. Cuando la firma esté disponible, las siguientes versiones de Windows irán firmadas y este aviso se eliminará.',
    it: "<strong>Questi file non sono firmati.</strong> Windows SmartScreen mostrerà «Il PC è protetto» e sarà necessario fare clic su «Altre informazioni» → «Esegui comunque» per avviare il programma di installazione. È previsto e non significa che il file sia malware. Verifica il digest SHA-256 in SHA256SUMS.txt prima di eseguirlo. Questa è un'<em>anteprima</em>: non una release stabile, e <code>latest</code> non punta a essa. Perché non firmato: la pipeline di rilascio tratta una release desktop non firmata come un fallimento, quindi non c'è ancora un certificato con cui firmare. Una domanda alla SignPath Foundation è stata preparata ma non ancora inoltrata. Quando la firma sarà disponibile, le successive release Windows saranno firmate e questo avviso rimosso.",
    pt: '<strong>Estes ficheiros não estão assinados.</strong> O Windows SmartScreen mostrará "O seu PC está protegido" e terá de clicar em "Mais informações" → "Executar mesmo assim" para executar o instalador. É o esperado e não significa que o ficheiro seja malware. Verifique o resumo SHA-256 no SHA256SUMS.txt antes de o executar. Esta é uma <em>pré-visualização</em>: não é um lançamento estável, e o <code>latest</code> não aponta para ela. Porquê sem assinatura: a cadeia de lançamento trata um lançamento de ambiente de trabalho sem assinatura como uma falha, por isso ainda não há certificado com que assinar. Uma candidatura à SignPath Foundation foi preparada mas ainda não submetida. Quando a assinatura estiver disponível, os lançamentos Windows seguintes serão assinados e este aviso removido.',
    ru: '<strong>Эти файлы не подписаны.</strong> Windows SmartScreen покажет «Защищён ваш компьютер», и для запуска установщика придётся нажать «Подробнее» → «Выполнить в любом случае». Это ожидаемо и не означает, что файл является вредоносным. Перед запуском проверьте хеш SHA-256 по файлу SHA256SUMS.txt. Это <em>предрелиз</em>: не стабильный выпуск, и <code>latest</code> не указывает на него. Почему без подписи: конвейер выпуска считает неподписанный настольный выпуск ошибкой, поэтому сертификата для подписи пока нет. Заявка в SignPath Foundation подготовлена, но ещё не подана. Когда подпись станет возможной, последующие выпуски Windows будут подписаны и это предупреждение будет удалено.',
    ar: '<strong>هذه الملفات غير موقَّعة.</strong> سيعرض Windows SmartScreen رسالة «حماية جهازك» وستحتاج إلى النقر على «مزيد من المعلومات» ← «تشغيل على أي حال» لتشغيل المُثبِّت. هذا متوقّع ولا يعني أن الملف برمجية ضارة. تحقّق من بصمة SHA-256 في SHA256SUMS.txt قبل تشغيله. هذه <em>إصدار مبكر</em>: ليست نسخة مستقرة، و<code>latest</code> لا يشير إليها. لماذا غير موقّع: فسلسلة الإصدار تعتبر إصدار سطح مكتب غير موقّع خطأً، لذا لا يوجد حتى الآن شهادة للتوقيع بها. أُعدّ طلب إلى برنامج SignPath Foundation لكنه لم يُقدَّم بعد. وبمجرد توفر التوقيع ستُوقَّع إصدارات Windows اللاحقة وسيُحذف هذا التحذير.',
    ja: '<strong>これらのファイルは署名されていません。</strong> Windows SmartScreen が「PC を保護しています」と表示され、インストーラーを実行するには「詳細」→「実行する」をクリックする必要があります。これは想定された動作であり、ファイルがマルウェアであることを意味しません。実行する前に SHA256SUMS.txt と SHA-256 ダイジェストを照合してください。これは<em>プレリリース</em>であり、安定したリリースではなく、<code>latest</code> もこれを指しません。未署名である理由: リリースパイプラインは未署名のデスクトップリリースを失敗として扱うため、現時点で署名に使える証明書がありません。SignPath Foundation への申請は準備済みですが、まだ提出していません。署名が可能になったら以降の Windows リリースは署名され、この警告は削除されます。',
    ko: '<strong>이 파일들은 서명되어 있지 않습니다.</strong> Windows SmartScreen가 "PC가 보호됩니다"를 표시하며, 설치 관리자를 실행하려면 "자세히 정보" → "그래도 실행"을 눌러야 합니다. 이는 예상된 동작이며 파일이 악성코드라는 뜻이 아닙니다. 실행하기 전에 SHA256SUMS.txt와 SHA-256 다이제스트를 대조하십시오. 이는 <em>프리릴리스</em>로 정식 릴리스가 아니며 <code>latest</code>도 이를 가리키지 않습니다. 서명되지 않은 이유: 릴리스 파이프라인이 서명되지 않은 데스크톱 릴리스를 실패로 취급하므로 아직 서명할 인증서가 없습니다. SignPath Foundation 신청은 준비됐지만 아직 제출하지 않았습니다. 서명이 가능해지면 이후 Windows 릴리스는 서명되고 이 경고는 제거됩니다.',
    zh: '<strong>这些文件未签名。</strong>Windows SmartScreen 会显示"已保护你的电脑"，需要点击"更多信息"→"仍要运行"才能启动安装程序。这是预期行为，不代表该文件是恶意软件。运行前请用 SHA256SUMS.txt 核对 SHA-256 摘要。这是一份<em>预发行版</em>：不是稳定发行版，<code>latest</code> 也不会指向它。未签名的原因是：发布流水线把未签名的桌面发行版视为失败，因此目前没有可用于签名的证书。已准备好向 SignPath Foundation 提交申请，但尚未提交。签名可用后，后续 Windows 发行版将签名，届时本提示会被移除。',
  },

  /* The link label. "unsigned" is in the text on purpose, so nobody reaches the
   * file without having been told what it is. */
  'win-preview-link': {
    tr: 'İmzasız önizlemeyi GitHub Releases\'dan indirin',
    en: 'Download the unsigned preview from GitHub Releases',
    de: 'Unsignierte Vorschau von GitHub Releases herunterladen',
    fr: "Télécharger l'aperçu non signé depuis GitHub Releases",
    es: 'Descargar la vista previa sin firmar desde GitHub Releases',
    it: "Scarica l'anteprima non firmata da GitHub Releases",
    pt: 'Transferir a pré-visualização sem assinatura do GitHub Releases',
    ru: 'Скачать неподписанную предварительную сборку с GitHub Releases',
    ar: 'نزّل الإعاينة غير الموقّعة من GitHub Releases',
    ja: 'GitHub Releases から未署名プレビューをダウンロード',
    ko: 'GitHub Releases에서 서명 없는 미리보기 다운로드',
    zh: '从 GitHub Releases 下载未签名预览版',
  },

  /* One line naming what is in the release, so the card is not just a warning. */
  'win-preview-assets': {
    tr: 'NSIS kurucusu (.exe), MSI paketi ve taşınabilir EXE — hepsi imzasız.',
    en: 'NSIS installer (.exe), MSI package and portable EXE — all unsigned.',
    de: 'NSIS-Installationsprogramm (.exe), MSI-Paket und portable EXE — alle unsigniert.',
    fr: 'Installeur NSIS (.exe), paquet MSI et EXE portable — tous non signés.',
    es: 'Instalador NSIS (.exe), paquete MSI y EXE portátil: los tres sin firmar.',
    it: 'Programma di installazione NSIS (.exe), pacchetto MSI ed EXE portatile: tutti non firmati.',
    pt: 'Instalador NSIS (.exe), pacote MSI e EXE portátil — todos sem assinatura.',
    ru: 'Установщик NSIS (.exe), пакет MSI и переносимый EXE — все без подписи.',
    ar: 'مُثبِّت NSIS (.exe) وحزمة MSI وملف EXE المحمول — جميعها غير موقَّعة.',
    ja: 'NSIS インストーラー (.exe)、MSI パッケージ、ポータブル EXE — いずれも未署名。',
    ko: 'NSIS 설치 관리자(.exe), MSI 패키지, 휴대형 EXE — 모두 서명 없음.',
    zh: 'NSIS 安装程序（.exe）、MSI 包和便携版 EXE — 三者均未签名。',
  },
};

apply(I18N_DIR, CODES, TRANSLATIONS);

/* The href is identical in every locale, so it is written directly rather than
 * per-language. A translated URL would be a broken link in eleven languages. */
for (const code of CODES) {
  const file = path.join(I18N_DIR, code + '.json');
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  json['win-preview-url'] = RELEASES;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
}
console.log(`win-preview-url = ${RELEASES} in ${CODES.length} locales`);
