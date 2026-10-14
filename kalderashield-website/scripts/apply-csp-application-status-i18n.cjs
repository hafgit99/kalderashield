/**
 * Updates the application-status paragraph on the code signing policy page, in
 * all twelve languages.
 *
 *   node scripts/apply-csp-application-status-i18n.cjs
 *
 * Why the text has to move now rather than at the moment of approval
 * ------------------------------------------------------------------
 * The policy page said the SignPath application was prepared but not
 * submitted. That was accurate when it was written and stayed accurate while
 * nothing changed.
 *
 * Two of the three preconditions are now met, and the third has been closed:
 *
 *   - Windows installers are published, as labelled unsigned previews;
 *   - kalderashield.com resolves and serves the site;
 *   - the code signing policy is linked from the home page and the download
 *     page in every language.
 *
 * What remains before the form is sent is a reviewer's decision plus two facts
 * only the maintainer can confirm: MFA on the accounts, and that the security
 * contact address is answered. A page saying "not submitted" invites the
 * reading that the project has not started, which is now the less accurate of
 * the two readings.
 *
 * Scoped to one key on purpose. `csp-p1-4` is the status paragraph; the keys
 * around it describe the key custody and the approval chain, none of which
 * change. A rule that matched on "SignPath" anywhere would have rewritten the
 * key custody paragraph as well.
 *
 * Two of the twelve strings also carried the English word "THEIR" in the
 * middle of a Japanese and a Korean sentence — a translation leak that made
 * both paragraphs read as machine output. They are rewritten from scratch here
 * rather than patched, which fixes it as a side effect.
 */
const fs = require('fs');
const path = require('path');

const { updateJsonFile } = require('./lib/safe-file.cjs');

const root = path.resolve(__dirname, '..');
const I18N = path.join(root, 'assets', 'js', 'i18n');
const KEY = 'csp-p1-4';

const TEXT = {
  tr:
    '<strong>Durum: başvuru hazırlandı, ön koşullar tamamlandı.</strong> KalderaShield, SignPath Foundation programına başvurmak üzeredir ve ön koşulların tamamını yerine getirmiştir: imzalanacak biçimde yayımlanmış Windows kurulum dosyaları vardır, proje sayfası canlıdır ve bu politika ana sayfa ile indirme sayfasından bağlanmaktadır. Başvurunun gönderilmesi, hesaplarda çok faktörlü kimlik doğrulamanın doğrulanması ve güvenlik iletişim adresinin yanıt süresinin teyit edilmesiyle önünde sonundadır. <strong>Bu bölüm, herhangi bir Windows dosyasının şu anda imzalı olduğu anlamına gelmez</strong> — hiçbir dosya imzalı değildir ve ilk imzalı sürümden önce bu metin güncellenecektir.',
  en:
    '<strong>Status: application prepared, preconditions met.</strong> KalderaShield is applying to the SignPath Foundation program and has met every stated precondition: Windows installers are published in the form that should be signed, the project page is live, and this policy is linked from the home page and the download page. What remains is submitting the form, confirming multi-factor authentication on the accounts, and confirming that the security contact address is answered. <strong>Nothing in this section means any Windows file is currently signed</strong> — none is, and this text is updated before the first signed release rather than after it.',
  de:
    '<strong>Status: Antrag vorbereitet, Voraussetzungen erfüllt.</strong> KalderaShield bewirbt sich beim SignPath-Foundation-Programm und hat alle genannten Voraussetzungen erfüllt: Windows-Installationsdateien sind in der zu signierenden Form veröffentlicht, die Projektseite ist live, und diese Richtlinie ist von der Startseite und der Download-Seite verlinkt. Offen bleiben das Absenden des Formulars, die Bestätigung der Multi-Faktor-Authentifizierung an den Konten und die Bestätigung, dass die Sicherheits-Kontaktadresse beantwortet wird. <strong>Nichts in diesem Abschnitt bedeutet, dass eine Windows-Datei derzeit signiert ist</strong> — keine ist es, und dieser Text wird vor der ersten signierten Veröffentlichung aktualisiert, nicht danach.',
  fr:
    '<strong>Statut : candidature préparée, conditions remplies.</strong> KalderaShield candidat au programme SignPath Foundation et a satisfait toutes les conditions indiquées : les installeurs Windows sont publiés dans la forme qui doit être signée, la page du projet est en ligne, et cette politique est liée depuis la page d’accueil et la page de téléchargement. Il reste à envoyer le formulaire, à confirmer l’authentification multifacteur sur les comptes et à confirmer que l’adresse de contact sécurité reçoit une réponse. <strong>Rien dans cette section ne signifie qu’un fichier Windows serait actuellement signé</strong> — aucun ne l’est, et ce texte sera mis à jour avant la première version signée, pas après.',
  es:
    '<strong>Estado: solicitud preparada, condiciones previas cumplidas.</strong> KalderaShield se presenta al programa de SignPath Foundation y ha cumplido todas las condiciones indicadas: los instaladores de Windows se publican en la forma que debe firmarse, la página del proyecto está activa y esta política está enlazada desde la página de inicio y la de descarga. Queda enviar el formulario, confirmar la autenticación multifactor en las cuentas y confirmar que se responde a la dirección de contacto de seguridad. <strong>Nada de esta sección significa que un archivo de Windows esté firmado actualmente</strong> — ninguno lo está, y este texto se actualizará antes de la primera versión firmada, no después.',
  it:
    '<strong>Stato: domanda pronta, prerequisiti soddisfatti.</strong> KalderaShield sta concorrendo al programma SignPath Foundation e ha soddisfatto ogni prerequisito indicato: gli installer Windows sono pubblicati nella forma che deve essere firmata, la pagina del progetto è online e questa informativa è collegata dalla home page e dalla pagina di download. Resta l’invio del modulo, la conferma dell’autenticazione a più fattori sugli account e la conferma che all’indirizzo di contatto per la sicurezza venga data risposta. <strong>Nulla in questa sezione significa che un file Windows sia attualmente firmato</strong> — nessuno lo è, e questo testo verrà aggiornato prima della prima release firmata, non dopo.',
  pt:
    '<strong>Estado: candidatura preparada, pré-requisitos cumpridos.</strong> O KalderaShield está a candidatar-se ao programa SignPath Foundation e cumpriu todos os pré-requisitos indicados: os instaladores do Windows são publicados na forma que deve ser assinada, a página do projeto está online e esta política está ligada a partir da página inicial e da página de transferência. Falta enviar o formulário, confirmar a autenticação multifator nas contas e confirmar que o endereço de contacto de segurança recebe resposta. <strong>Nada nesta secção significa que um ficheiro do Windows esteja assinado neste momento</strong> — nenhum está, e este texto será atualizado antes da primeira versão assinada, não depois.',
  ru:
    '<strong>Статус: заявка подготовлена, предварительные условия выполнены.</strong> KalderaShield подаёт заявку в программу SignPath Foundation и выполнил все указанные предварительные условия: установщики Windows опубликованы в той форме, которая должна подписываться, страница проекта доступна, а эта политика связана с главной страницы и со страницы загрузки. Остаётся отправить форму, подтвердить многофакторную аутентификацию на учётных записях и подтвердить, что на адрес безопасности отвечают. <strong>Ничто в этом разделе не означает, что какой-либо файл Windows сейчас подписан</strong> — не подписан ни один, и этот текст будет обновлён до первого подписанного выпуска, а не после него.',
  ja:
    '<strong>状態：申請は準備完了、前提条件を満たしています。</strong>KalderaShield は SignPath Foundation プログラムに申請する準備を目的としており、给对方の定めた前提条件をすべて満たしています。署名される形式の Windows インストーラーが公開済みで、プロジェクトのページは公開中であり、このポリシーはトップページおよびダウンロードページからリンクされています。残っているのはフォームの送信、アカウントの多要素認証の確認、そしてセキュリティ連絡先用メールアドレスに返信があることの確認です。<strong>この節の記述は、現在のところ Windows のファイルに署名があることを意味しません</strong>—署名は一切されておらず、この文は最初の署名済みリリースの前に、 事後ではなく、更新されます。',
  zh:
    '<strong>状态：申请已准备，前置条件已满足。</strong>KalderaShield 正在申请 SignPath Foundation 项目，并已满足对方列出的全部前置条件：Windows 安装程序已以应被签名的形式发布，项目页面已上线，且本政策在首页和下载页都有链接。剩下的工作是提交表单、确认账号已启用多因素认证，以及确认安全联系邮箱有人回复。<strong>本节内容不表示任何 Windows 文件目前已签名</strong>——目前一个都没有签名，本段文字会在第一个签名版本发布之前更新，而不是之后。',
  ko:
    '<strong>상태: 신청 준비 완료, 사전 조건 충족.</strong>KalderaShield는 SignPath Foundation 프로그램에 신청할 준비를 하고 있으며, 상대가 명시한 사전 조건을 모두 충족했습니다. 서명될 형식의 Windows 설치 관리자가 이미 공개되어 있고, 프로젝트 페이지가 운영 중이며, 이 정책은 홈페이지와 다운로드 페이지에서 모두 링크되어 있습니다. 남은 일은 신청서 제출, 계정의 다중 인증 확인, 그리고 보안 연락처 주소에 회신이 있는지 확인하는 것입니다. <strong>이 절의 어떤 문장도 현재 Windows 산출물이 서명되어 있다는 뜻이 아닙니다</strong> — 현재 서명된 산출물은 하나도 없으며, 이 문단은 첫 서명 릴리스가 나온 뒤가 아니라 그 전에 갱신됩니다.',
  ar:
    '<strong>الحالة: الطلب جاهز، والشروط السابقة مستوفاة.</strong> KalderaShield يتقدّم بطلب الانضمام إلى برنامج SignPath Foundation وقد استوفى كل الشروط السابقة المذكورة: installers Windows منشورة بالصيغة التي ينبغي توقيعها، وصفحة المشروع منشورة، وهذه السياسة مرتبطة من الصفحة الرئيسية وصفحة التنزيل. ما تبقى هو إرسال النموذج، والتأكد من تفعيل المصادقة متعددة العوامل على الحسابات، والتأكد من وجود رد على عنوان الاتصال الأمني. <strong>لا يعني أي شيء في هذا القسم أن أي ملف من ملفات Windows موقَّع حالياً</strong> — لا يوجد أي ملف موقَّع، وسيُحدَّث هذا النص قبل أول إصدار موقَّع لا بعده.',
};

let changed = 0;
for (const locale of Object.keys(TEXT)) {
  const file = path.join(I18N, `${locale}.json`);
  // A dictionary without this key has no status paragraph to correct, and
  // adding one would create a string nothing renders.
  updateJsonFile(file, (dict) => {
    if (typeof dict[KEY] !== 'string') {
      throw new Error(`${locale}.json ${KEY} yok`);
    }
    dict[KEY] = TEXT[locale];
    return dict;
  });
  changed++;
}

console.log(`${changed} sozlukte ${KEY} guncellendi.`);
console.log('Simdi: node scripts/generate-locales.cjs');