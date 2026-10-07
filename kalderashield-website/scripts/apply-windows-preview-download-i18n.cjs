/* Updates the download page's Windows card for the unsigned preview.
 *
 *   node scripts/apply-windows-preview-download-i18n.cjs
 *
 * The card previously said the application was in progress and that no Windows
 * installer is published. Both were true when written and stop being true the
 * moment the preview ships, so they are changed together with the preview landing
 * rather than after.
 *
 * The wording is the part that matters. A user reading the download page has to
 * learn three things before clicking, not after: the file is unsigned, Windows
 * will warn, and there is a hash to check. The release notes say the same three
 * things. If those two ever disagree, this is the file that gets fixed.
 */
const fs = require('fs');
const path = require('path');

const { apply } = require('./lib/signpath-policy-i18n.cjs');

const I18N_DIR = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');
const CODES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'tr', 'zh'];

const TRANSLATIONS = {
  'win-store-title': {
    tr: 'İmzasız Önizleme — İmza Başvurusu Yapılmadı',
    en: 'Unsigned preview — signing application not yet submitted',
    de: 'Unsignierte Vorschau — Signatur-Antrag noch nicht gestellt',
    fr: 'Aperçu non signé — candidature pas encore déposée',
    es: 'Vista previa sin firmar — solicitud de firma aún no presentada',
    it: 'Anteprima non firmata — candidatura non ancora presentata',
    pt: 'Pré-visualização sem assinatura — candidatura ainda não submetida',
    ru: 'Неподписанная предварительная сборка — заявка на подписание ещё не подана',
    ar: 'إعاينة غير موقَّعة — لم يُقدَّم طلب التوقيع بعد',
    ja: '未署名プレビュー — 署名申請は未提出',
    ko: '서명 없는 미리보기 — 서명 신청 아직 제출되지 않음',
    zh: '未签名预览 — 签名申请尚未提交',
  },

  'win-store-desc': {
    tr: '<strong>Bu dosyalar imzalı değildir.</strong> Windows "PC\'niz korundu" uyarısı gösterecek ve kurulumu çalıştırmak için "Daha fazla bilgi" → "Yine de çalıştır" demeniz gerekecek. Bu beklenen bir durumdur ve kötü amaçlı yazılım anlamına gelmez. Çalıştırmadan önce SHA-256 karmasını SHA256SUMS.txt ile doğrulayın. Bu bir <em>ön sürümdür</em> ve kararlı sürüm değildir. Neden imzasız olduğu: sürüm hattı imzasız bir masaüstü sürümünü hata sayar, bu yüzden şimdilik imzalayacak bir sertifika yok. İmzalama için SignPath Foundation programına hazırlık yapıldı, başvuru henüz gönderilmedi. İmza sağlandığında sonraki Windows sürümleri imzalanacak ve bu uyarı kaldırılacak.',
    en: '<strong>These files are not signed.</strong> Windows SmartScreen will show "Windows protected your PC" and you must click "More info" → "Run anyway" to run the installer. This is expected and it does not mean the file is malware. Verify the SHA-256 digest against SHA256SUMS.txt before running it. This is a <em>pre-release</em>, not a stable release. Why unsigned: the release pipeline treats an unsigned desktop release as a failure, so there is no certificate to sign with yet. The project has prepared an application to the SignPath Foundation for free open-source signing; it has not yet been submitted. When signing is available, subsequent Windows releases will be signed and this warning will be removed.',
    de: '<strong>Diese Dateien sind nicht signiert.</strong> Windows zeigt "Der PC ist geschützt", und Sie müssen auf "Weitere Informationen" → "Trotzdem ausführen" klicken, um das Installationsprogramm zu starten. Das ist erwartet und bedeutet nicht, dass die Datei Schadsoftware ist. Prüfen Sie vor dem Start die SHA-256-Prüfsumme gegen SHA256SUMS.txt. Dies ist eine <em>Vorabversion</em>, keine stabile Version. Warum unsigniert: Die Release-Pipeline behandelt ein unsigniertes Desktop-Release als Fehler, es gibt also noch kein Zertifikat zum Signieren. Das Projekt hat eine Bewerbung beim SignPath Foundation für kostenlose Open-Source-Signierung vorbereitet; sie wurde noch nicht eingereicht. Sobald Signieren möglich ist, werden nachfolgende Windows-Versionen signiert und dieser Hinweis entfernt.',
    fr: "<strong>Ces fichiers ne sont pas signés.</strong> Windows affichera « Votre PC est protégé » et vous devrez cliquer sur « Informations » → « Exécuter quand même » pour lancer l'installeur. C'est attendu et cela ne signifie pas que le fichier est un logiciel malveillant. Vérifiez la somme SHA-256 dans SHA256SUMS.txt avant de l'exécuter. Ceci est une <em>préversion</em>, pas une version stable. Pourquoi non signé : la chaîne de publication traite une version de bureau non signée comme un échec, il n'y a donc pas encore de certificat de signature. Le projet a préparé une candidature auprès de la SignPath Foundation pour la signature open source gratuite ; elle n'a pas encore été déposée. Dès que la signature sera possible, les versions Windows suivantes seront signées et cet avertissement supprimé.",
    es: '<strong>Estos archivos no están firmados.</strong> Windows mostrará "Tu PC está protegido" y tendrás que hacer clic en "Más información" → "Ejecutar de todas formas" para ejecutar el instalador. Es lo esperado y no significa que el archivo sea malware. Verifica el resumen SHA-256 en SHA256SUMS.txt antes de ejecutarlo. Esta es una <em>versión preliminar</em>, no una versión estable. Por qué sin firmar: la cadena de publicación trata una versión de escritorio sin firmar como un fallo, así que todavía no hay certificado con el que firmar. El proyecto ha preparado una solicitud al programa de SignPath Foundation para firma de código abierto gratuita; aún no se ha enviado. Cuando la firma esté disponible, las siguientes versiones de Windows irán firmadas y este aviso se eliminará.',
    it: "<strong>Questi file non sono firmati.</strong> Windows mostrerà \"Il PC è protetto\" e sarà necessario fare clic su \"Altre informazioni\" → \"Esegui comunque\" per avviare il programma di installazione. È previsto e non significa che il file sia malware. Verifica il digest SHA-256 in SHA256SUMS.txt prima di eseguirlo. Questa è un'<em>anteprima</em>, non una release stabile. Perché non firmato: la pipeline di rilascio tratta una release desktop non firmata come un fallimento, quindi non c'è ancora un certificato con cui firmare. Il progetto ha preparato una domanda alla SignPath Foundation per la firma open source gratuita; non è ancora stata inoltrata. Quando la firma sarà disponibile, le successive release Windows saranno firmate e questo avviso rimosso.",
    pt: '<strong>Estes ficheiros não estão assinados.</strong> O Windows mostrará "O seu PC está protegido" e terá de clicar em "Mais informações" → "Executar mesmo assim" para executar o instalador. É o esperado e não significa que o ficheiro seja malware. Verifique o resumo SHA-256 no SHA256SUMS.txt antes de o executar. Esta é uma <em>pré-visualização</em>, não um lançamento estável. Porquê sem assinatura: a cadeia de lançamento trata um lançamento de ambiente de trabalho sem assinatura como uma falha, por isso ainda não há certificado com que assinar. O projeto preparou uma candidatura à SignPath Foundation para assinatura de código aberto gratuita; ainda não foi submetida. Quando a assinatura estiver disponível, os lançamentos Windows seguintes serão assinados e este aviso removido.',
    ru: '<strong>Эти файлы не подписаны.</strong> Windows покажет «Защищён ваш компьютер», и для запуска установщика придётся нажать «Подробнее» → «Выполнить в любом случае». Это ожидаемо и не означает, что файл является вредоносным. Перед запуском проверьте хеш SHA-256 по файлу SHA256SUMS.txt. Это <em>предрелиз</em>, а не стабильный выпуск. Почему без подписи: конвейер выпуска считает неподписанный настольный выпуск ошибкой, поэтому сертификата для подписи пока нет. Проект подготовил заявку в SignPath Foundation на бесплатную подпись open source; она ещё не подана. Когда подпись станет возможной, последующие выпуски Windows будут подписаны, и это предупреждение будет удалено.',
    ar: '<strong>هذه الملفات غير موقَّعة.</strong> سيعرض Windows رسالة «حماية جهازك» وستحتاج إلى النقر على «مزيد من المعلومات» ← «تشغيل على أي حال» لتشغيل المُثبِّت. هذا متوقّع ولا يعني أن الملف برمجية ضارة. تحقّق من بصمة SHA-256 في SHA256SUMS.txt قبل تشغيله. هذه <em>إصدار مبكر</em> وليست نسخة مستقرة. لماذا غير موقّع: فسلسلة الإصدار تعتبر إصدار سطح مكتب غير موقّع خطأً، لذا لا يوجد حتى الآن شهادة للتوقيع بها. أعدّ المشروع طلبًا إلى برنامج SignPath Foundation للتوقيع المجاني على البرمجيات مفتوحة المصدر؛ ولم يُقدَّم بعد. وبمجرد توفر التوقيع ستُوقَّع إصدارات Windows اللاحقة وسيُحذف هذا التحذير.',
    ja: '<strong>これらのファイルは署名されていません。</strong> Windows が「PC を保護しています」と表示し、インストーラーを実行するには「詳細」→「実行する」をクリックする必要があります。これは想定された動作であり、ファイルがマルウェアであることを意味しません。実行する前に SHA256SUMS.txt と SHA-256 ダイジェストを照合してください。これは<em>プレリリース</em>であり、安定したリリースではありません。未署名である理由: リリースパイプラインは未署名のデスクトップリリースを失敗として扱うため、現時点で署名に使える証明書がありません。本プロジェクトはオープンソース向けの無料署名について SignPath Foundation への申請を準備済みですが、まだ提出していません。署名が可能になったら以降の Windows リリースは署名され、この警告は削除されます。',
    ko: '<strong>이 파일들은 서명되어 있지 않습니다.</strong> Windows가 "PC가 보호됩니다"를 표시하며, 설치 관리자를 실행하려면 "자세히 정보" → "그래도 실행"을 눌러야 합니다. 이는 예상된 동작이며 파일이 악성코드라는 뜻이 아닙니다. 실행하기 전에 SHA256SUMS.txt와 SHA-256 다이제스트를 대조하십시오. 이는 <em>프리릴리스</em>이며 정식 릴리스가 아닙니다. 서명되지 않은 이유: 릴리스 파이프라인이 서명되지 않은 데스크톱 릴리스를 실패로 취급하므로 아직 서명할 인증서가 없습니다. 이 프로젝트는 오픈소스 무료 서명을 위한 SignPath Foundation 신청을 준비했으나 아직 제출하지 않았습니다. 서명이 가능해지면 이후 Windows 릴리스는 서명되고 이 경고는 제거됩니다.',
    zh: '<strong>这些文件未签名。</strong>Windows 会显示"已保护你的电脑"，需要点击"更多信息"→"仍要运行"才能启动安装程序。这是预期行为，不代表该文件是恶意软件。运行前请用 SHA256SUMS.txt 核对 SHA-256 摘要。这是一份<em>预发行版</em>，不是稳定发行版。未签名的原因是：发布流水线把未签名的桌面发行版视为失败，因此目前没有可用于签名的证书。本项目已准备好向 SignPath Foundation 申请免费的开源代码签名，但尚未提交。签名可用后，后续 Windows 发行版将签名，届时本提示会被移除。',
  },
};

apply(I18N_DIR, CODES, TRANSLATIONS);
