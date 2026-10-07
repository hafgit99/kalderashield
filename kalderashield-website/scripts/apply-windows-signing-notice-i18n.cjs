/* Rewrites the Windows card's signing notice and adds the code signing policy
 * link, in all twelve locales.
 *
 *   node scripts/apply-windows-signing-notice-i18n.cjs
 *
 * Why the copy changed: the card said the Windows packages were "coming to the
 * Microsoft Store" and that the Store would re-sign them so nobody had to buy a
 * certificate. That was true when it was written and stopped being true when the
 * SignPath Foundation application started -- a reviewer reading the download page
 * would have found two incompatible stories about where the signature comes from,
 * and the one on the download page is the one a prospective user reads first.
 *
 * The new text says what is true: nothing is published without a certificate, the
 * pipeline treats an unsigned desktop release as a failure, the application is
 * pending, and the policy is linked.
 *
 * Kept separate from the code signing policy translations because these three keys
 * belong to the download page and are edited for a different reason.
 */
const fs = require('fs');
const path = require('path');

const { apply } = require('./lib/signpath-policy-i18n.cjs');

const I18N_DIR = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');

const TRANSLATIONS = {
  'win-store-title': {
    tr: 'İmza Başvurusu Sürüyor',
    en: 'Signing application in progress',
    de: 'Signatur-Antrag läuft',
    fr: 'Demande de signature en cours',
    es: 'Solicitud de firma en curso',
    it: 'Domanda di firma in corso',
    pt: 'Pedido de assinatura em curso',
    ru: 'Заявка на подписание рассматривается',
    ar: 'طلب التوقيع قيد المراجعة',
    ja: '署名申請中',
    ko: '서명 신청 진행 중',
    zh: '签名申请进行中',
  },

  'win-store-desc': {
    tr: 'Windows paketleri kod imzalama sertifikası olmadan yayımlanmaz: sürüm hattı imzasız bir masaüstü sürümünü hata sayar. SignPath Foundation programına başvurduk; onay gelirse paketler sertifikayla imzalanacak. Bu sırada Windows kurucuları yayımlanmaz.',
    en: 'Windows packages are not published without a code-signing certificate: the release pipeline treats an unsigned desktop release as a failure. We have applied to the SignPath Foundation program; if approved, the packages will be signed with the certificate. Until then, no Windows installer is published.',
    de: 'Windows-Pakete werden ohne Code-Signatur-Zertifikat nicht veröffentlicht: Die Release-Pipeline behandelt ein unsigniertes Desktop-Release als Fehler. Wir haben uns beim SignPath-Foundation-Programm beworben; bei einer Genehmigung werden die Pakete mit dem Zertifikat signiert. Bis dahin wird kein Windows-Installationsprogramm veröffentlicht.',
    fr: "Les paquets Windows ne sont pas publiés sans certificat de signature de code : la chaîne de publication traite une version de bureau non signée comme un échec. Nous avons candidaté au programme SignPath Foundation ; en cas d'approbation, les paquets seront signés avec le certificat. D'ici là, aucun installeur Windows n'est publié.",
    es: 'Los paquetes de Windows no se publican sin un certificado de firma de código: la cadena de publicación trata una versión de escritorio sin firmar como un fallo. Hemos solicitado el programa de SignPath Foundation; si se aprueba, los paquetes se firmarán con el certificado. Hasta entonces, no se publica ningún instalador de Windows.',
    it: 'I pacchetti Windows non vengono pubblicati senza un certificato di firma del codice: la pipeline di rilascio tratta una release desktop non firmata come un fallimento. Abbiamo presentato domanda al programma SignPath Foundation; se approvata, i pacchetti verranno firmati con il certificato. Fino ad allora nessun installer Windows viene pubblicato.',
    pt: 'Os pacotes Windows não são publicados sem um certificado de assinatura de código: a cadeia de lançamento trata um lançamento de ambiente de trabalho sem assinatura como uma falha. Candidaturas ao programa da SignPath Foundation; se aprovado, os pacotes serão assinados com o certificado. Até lá, nenhum instalador do Windows é publicado.',
    ru: 'Пакеты для Windows не публикуются без сертификата подписания кода: конвейер выпуска считает неподписанный настольный выпуск ошибкой. Мы подали заявку в программу SignPath Foundation; при одобрении пакеты будут подписаны этим сертификатом. До тех пор установщик для Windows не публикуется.',
    ar: 'لا تُنشر حزم Windows دون شهادة توقيع شيفرة: فسلسلة الإصدار تعتبر إصدار سطح مكتب غير موقّع خطأً. وقد قدّمنا طلبًا إلى برنامج SignPath Foundation؛ وعند الموافقة ستُوقَّع الحزم بالشهادة. وإلى ذلك الحين لا يُنشر أي مُثبِّت لـ Windows.',
    ja: 'Windows のパッケージはコード署名証明書なしでは公開されません。リリースパイプラインは未署名のデスクトップリリースを失敗として扱うためです。SignPath Foundation プログラムに申請済みで、承認されれば証明書で署名されます。それまで Windows インストーラーは公開されません。',
    ko: 'Windows 패키지는 코드 서명 인증서 없이 게시되지 않습니다. 릴리스 파이프라인이 서명되지 않은 데스크톱 릴리스를 실패로 취급하기 때문입니다. SignPath Foundation 프로그램에 신청했으며, 승인되면 인증서로 서명됩니다. 그때까지 Windows 설치 관리자는 게시되지 않습니다.',
    zh: '没有代码签名证书，Windows 安装包不会发布——发布流水线把未签名的桌面发行版视为失败。我们已向 SignPath Foundation 计划提交申请；若获批准，安装包将使用该证书签名。在此之前不发布任何 Windows 安装程序。',
  },

  'dl-csp-link': {
    tr: 'Kod İmza Politikası',
    en: 'Code signing policy',
    de: 'Richtlinie zur Code-Signierung',
    fr: 'Politique de signature de code',
    es: 'Política de firma de código',
    it: 'Informativa sulla firma del codice',
    pt: 'Política de assinatura de código',
    ru: 'Политика подписания кода',
    ar: 'سياسة توقيع الشيفرة',
    ja: 'コード署名ポリシー',
    ko: '코드 서명 정책',
    zh: '代码签名政策',
  },
};

apply(I18N_DIR, ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'tr', 'zh'], TRANSLATIONS);
