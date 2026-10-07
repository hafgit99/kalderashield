/* Updates the Windows platform page for the unsigned preview.
 *
 *   node scripts/apply-windows-preview-platform-i18n.cjs
 *
 * content/pages/13-windows.json carries its own copy per locale rather than
 * reading from a shared dictionary, but this particular page only ships `tr` and
 * `en` blocks: build-pages.cjs falls back to English for a locale with no block
 * and then generate-locales.cjs translates from the merged dictionaries. So only
 * the two source locales are written here, and the other ten are reached through
 * the `p-windows-sec-body` keys that build-pages.cjs harvests.
 *
 * The section being changed is `secBody`, the "Signatures and SmartScreen"
 * notice, which currently says Windows installers are not published at all.
 *
 * Like the download card, this has to say the same three things the release notes
 * say: unsigned, Windows will warn, verify the hash. A reader who lands here from
 * a search and the download card says the same thing has two sources agreeing,
 * which is the point.
 *
 * The ten other locales are applied by the separate
 * apply-windows-preview-platform-keys.cjs, which writes them straight into the
 * dictionaries.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.resolve(__dirname, '..', 'content', 'pages', '13-windows.json');
const page = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const SOURCE_LOCALES = ['en', 'tr'];

const SEC_BODY = {
  tr: 'Windows kurucuları <strong>imzalı değildir</strong> ve Authenticode imzası taşımıyor. İmza sertifikası yok: sürüm hattı imzasız bir masaüstü sürümünü hata sayar, bu yüzden şu anda yalnızca açıkça etiketlenmiş bir <em>ön sürüm</em> yayımlanır. Bu dosyalarda Windows SmartScreen "PC\'niz korundu" gösterecek ve kurulumu çalıştırmak için "Daha fazla bilgi" → "Yine de çalıştır" demeniz gerekecek — bu beklenen bir durumdur. Kurmadan önce SHA-256 karmasını SHA256SUMS.txt ile doğrulayın. İmzalama için SignPath Foundation programına hazırlık yapıldı, başvuru henüz gönderilmedi; imza sağlandığında sonraki sürümler imzalanacak ve bu uyarı kalkacak.',
  en: 'Windows installers are <strong>not signed</strong> and carry no Authenticode signature. There is no signing certificate: the release pipeline treats an unsigned desktop release as a failure, so only an explicitly labelled <em>pre-release</em> is published for now. These files will trigger the Windows SmartScreen "Windows protected your PC" warning, and you must click "More info" → "Run anyway" to run the installer — this is expected. Verify the SHA-256 digest against SHA256SUMS.txt before installing. An application to the SignPath Foundation for free open-source signing has been prepared but has not yet been submitted; once signing is available, subsequent releases will be signed and this warning goes away.',
  de: 'Windows-Installationsprogramme sind <strong>nicht signiert</strong> und tragen keine Authenticode-Signatur. Es gibt kein Signaturzertifikat: Die Release-Pipeline behandelt ein unsigniertes Desktop-Release als Fehler, daher wird derzeit nur eine ausdrücklich gekennzeichnete <em>Vorabversion</em> veröffentlicht. Diese Dateien lösen die SmartScreen-Warnung "Der PC ist geschützt" aus, und Sie müssen auf "Weitere Informationen" → "Trotzdem ausführen" klicken — das ist erwartet. Prüfen Sie vor der Installation die SHA-256-Prüfsumme gegen SHA256SUMS.txt. Eine Bewerbung beim SignPath Foundation für kostenlose Open-Source-Signierung ist vorbereitet, aber noch nicht eingereicht; sobald Signieren möglich ist, werden nachfolgende Versionen signiert und diese Warnung entfällt.',
  fr: "Les installeurs Windows sont <strong>non signés</strong> et ne portent pas de signature Authenticode. Il n'y a pas de certificat de signature : la chaîne de publication traite une version de bureau non signée comme un échec, donc seule une <em>préversion</em> explicitement étiquetée est publiée pour l'instant. Ces fichiers déclenchent l'avertissement SmartScreen « Votre PC est protégé », et vous devrez cliquer sur « Informations » → « Exécuter quand même » — c'est attendu. Vérifiez la somme SHA-256 dans SHA256SUMS.txt avant l'installation. Une candidature auprès de la SignPath Foundation pour la signature open source gratuite a été préparée mais pas encore déposée ; dès que la signature sera possible, les versions suivantes seront signées et cet avertissement disparaîtra.",
  es: 'Los instaladores de Windows <strong>no están firmados</strong> y no llevan firma Authenticode. No hay certificado de firma: la cadena de publicación trata una versión de escritorio sin firmar como un fallo, así que por ahora solo se publica una <em>versión preliminar</em> etiquetada explícitamente. Estos archivos provocan el aviso de SmartScreen "Tu PC está protegido" y tendrás que hacer clic en "Más información" → "Ejecutar de todas formas"; es lo esperado. Verifica el resumen SHA-256 en SHA256SUMS.txt antes de instalar. Se ha preparado una solicitud al programa de SignPath Foundation para firma de código abierto gratuita pero aún no se ha enviado; cuando la firma esté disponible, las siguientes versiones irán firmadas y este aviso desaparecerá.',
  it: "Gli installer Windows <strong>non sono firmati</strong> e non portano una firma Authenticode. Non c'è un certificato di firma: la pipeline di rilascio tratta una release desktop non firmata come un fallimento, quindi al momento viene pubblicata soltanto un'<em>anteprima</em> etichettata esplicitamente. Questi file attivano l'avviso SmartScreen «Il PC è protetto» e sarà necessario fare clic su «Altre informazioni» → «Esegui comunque»: è previsto. Verifica il digest SHA-256 in SHA256SUMS.txt prima di installare. Una domanda alla SignPath Foundation per la firma open source gratuita è stata preparata ma non ancora inoltrata; quando la firma sarà disponibile, le release successive saranno firmate e questo avviso scomparirà.",
  pt: 'Os instaladores do Windows <strong>não estão assinados</strong> e não têm assinatura Authenticode. Não existe certificado de assinatura: a cadeia de lançamento trata um lançamento de ambiente de trabalho sem assinatura como uma falha, por isso por agora só é publicada uma <em>pré-visualização</em> explicitamente rotulada. Estes arquivos acionam o aviso do SmartScreen "O seu PC está protegido" e terá de clicar em "Mais informações" → "Executar mesmo assim" — é o esperado. Verifique o resumo SHA-256 no SHA256SUMS.txt antes de instalar. Foi preparada uma candidatura à SignPath Foundation para assinatura de código aberto gratuita, mas ainda não submetida; quando a assinatura estiver disponível, os lançamentos seguintes serão assinados e este aviso desaparece.',
  ru: 'Установщики для Windows <strong>не подписаны</strong> и не имеют подписи Authenticode. Сертификата для подписи нет: конвейер выпуска считает неподписанный настольный выпуск ошибкой, поэтому сейчас публикуется только явно помеченный <em>предрелиз</em>. Эти файлы вызывают предупреждение SmartScreen «Защищён ваш компьютер», и для запуска потребуется нажать «Подробнее» → «Выполнить в любом случае» — это ожидаемо. Перед установкой проверьте хеш SHA-256 по файлу SHA256SUMS.txt. Заявка в SignPath Foundation на бесплатную подпись open source подготовлена, но ещё не подана; когда подпись станет возможной, последующие выпуски будут подписаны и это предупреждение исчезнет.',
  ar: 'مُثبِّتات Windows <strong>غير موقَّعة</strong> ولا تحمل توقيع Authenticode. لا توجد شهادة توقيع: فسلسلة الإصدار تعتبر إصدار سطح مكتب غير موقّع خطأً، لذا لا يُنشر حاليًا سوى <em>إصدار مبكر</em> موسوم بوضوح. These files trigger the SmartScreen warning "حماية جهازك" وستحتاج إلى النقر على «مزيد من المعلومات» ← «تشغيل على أي حال» — وهو متوقّع. تحقّق من بصمة SHA-256 في SHA256SUMS.txt قبل التثبيت. وقد أُعدّ طلب إلى برنامج SignPath Foundation للتوقيع المجاني على البرمجيات مفتوحة المصدر، لكنه لم يُقدَّم بعد؛ وبمجرد توفر التوقيع ستُوقَّع الإصدارات اللاحقة وسيختفي هذا التحذير.',
  ja: 'Windows インストーラーは<strong>署名されていません</strong>。Authenticode 署名も付いていません。署名証明書がないためです。リリースパイプラインは未署名のデスクトップリリースを失敗として扱うので、現時点では明示的にラベルされた<em>プレリリース</em>のみを公開しています。これらのファイルでは Windows SmartScreen の「PC を保護しています」が表示され、「詳細」→「実行する」をクリックする必要があります。これは想定された動作です。インストール前に SHA256SUMS.txt と SHA-256 ダイジェストを照合してください。オープンソース向けの無料署名について SignPath Foundation への申請は準備済みですが、まだ提出していません。署名が可能になったら以降のリリースは署名され、この警告はなくなります。',
  ko: 'Windows 설치 관리자는 <strong>서명되어 있지 않으며</strong> Authenticode 서명도 없습니다. 서명 인증서가 없기 때문입니다. 릴리스 파이프라인이 서명되지 않은 데스크톱 릴리스를 실패로 취급하므로 현재는 명시적으로 라벨된 <em>프리릴리스</em>만 게시됩니다. 이 파일에서는 Windows SmartScreen "PC가 보호됩니다" 경고가 표시되며, 실행하려면 "자세히 정보" → "그래도 실행"을 눌러야 합니다. 이는 예상된 동작입니다. 설치하기 전에 SHA256SUMS.txt와 SHA-256 다이제스트를 대조하십시오. 오픈소스 무료 서명을 위한 SignPath Foundation 신청은 준비됐지만 아직 제출하지 않았으며, 서명이 가능해지면 이후 릴리스는 서명되고 이 경고는 사라집니다.',
  zh: 'Windows 安装程序<strong>未签名</strong>，也不带 Authenticode 签名。没有签名证书：发布流水线把未签名的桌面发行版视为失败，因此目前只发布明确标注的<em>预发行版</em>。这些文件会触发 Windows SmartScreen 的"已保护你的电脑"提示，需要点击"更多信息"→"仍要运行"才能安装——这是预期行为。安装前请用 SHA256SUMS.txt 核对 SHA-256 摘要。已准备好向 SignPath Foundation 申请免费的开源代码签名，但尚未提交；签名可用后，后续发行版将签名，本提示也会消失。',
};

let applied = 0;
const missing = [];

for (const locale of SOURCE_LOCALES) {
  if (!page.i18n[locale]) {
    missing.push(locale);
    continue;
  }
  page.i18n[locale].secBody = SEC_BODY[locale];
  applied++;
}

if (missing.length) {
  console.error('no i18n block for: ' + missing.join(', '));
  process.exit(1);
}

fs.writeFileSync(FILE, JSON.stringify(page, null, 2) + '\n', 'utf8');
console.log(`updated secBody for ${applied} locale(s)`);
