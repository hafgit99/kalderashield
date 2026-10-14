/**
 * Documents the optional breach check in the privacy policy, in all twelve
 * languages.
 *
 *   node scripts/apply-privacy-breach-check-i18n.cjs
 *
 * Why this is a change and not a clarification
 * --------------------------------------------
 * The application contacts Have I Been Pwned when the user opens the Security
 * Audit screen with the breach check enabled: it sends the first five hex
 * characters of a password's SHA-1 digest and nothing else. The privacy policy
 * did not mention it, and the code signing policy claimed the binaries carried
 * no network client at all. Both statements are corrected here, and the code
 * default changed with them.
 *
 * Two keys rather than an edit to the existing ones. `privacy-p1-2` and
 * `privacy-p1-5` are long sentences that already exist in twelve languages;
 * rewriting either one would mean re-reading twelve translations to decide what
 * they were supposed to have said. A new paragraph can be translated on its own
 * and compared against itself.
 *
 * Inserted by locating `data-i18n` attributes rather than by matching the
 * prose: matching prose means matching Turkish through a console that mangles
 * it, which is how a wrong character ends up in a legal page.
 */
const path = require('path');

const { updateFile, updateJsonFile } = require('./lib/safe-file.cjs');

const root = path.resolve(__dirname, '..');
const I18N = path.join(root, 'assets', 'js', 'i18n');
const PAGE = path.join(root, 'privacy.html');

/** [locale, after privacy-p1-2, after privacy-p1-5]. */
const TEXT = {
  tr: [
    'Kasa içeriğinizin hiçbir kısmı hiçbir sunucuya iletilmez. Şifrelerinizden türetilen ve cihazınızdan çıkabilen tek veri, isteğe bağlı sızmış şifre denetimidir; siz açmazsanız kapalı kalır ve 5. bölümde anlatılır.',
    'Uygulamanın Güvenlik Denetimi ekranı, şifrelerinizin bilinen bir ihlal veri tabanında yer alıp almadığını sorabilmek için Have I Been Pwned’in k-anonimlik aralık API’sini kullanır. Bu durumda gönderilen tek şey, şifrenizin SHA-1 özetinin ilk beş hex karakteridir; şifrenin kendisi veya özetin geri kalanı gönderilmez, yanıtlar da boyut eşleşmesini engellemek için doldurulur. Bu denetim <strong>varsayılan olarak kapalıdır</strong> ve yalnızca siz ekrandaki düğmeye dokunarak etkinleştirdiğinizde çalışır; kapatıldığında hiçbir istek gönderilmez.',
  ],
  en: [
    'Nothing in your vault is transmitted to any server. The only data derived from your passwords that can leave the device is the optional breach check, which stays off unless you turn it on and is described in section 5.',
    'The Security Audit screen in the app can ask Have I Been Pwned, through its k-anonymity range API, whether your passwords appear in a known breach corpus. In that case the only thing sent is the first five hex characters of a password’s SHA-1 digest; neither the password nor the rest of the digest is transmitted, and responses are padded so their size cannot be correlated. This check is <strong>off by default</strong> and runs only when you enable it with the button on that screen; once it is off, no request is sent at all.',
  ],
  de: [
    'Aus Ihrem Tresor wird nichts an einen Server übertragen. Die einzigen aus Ihren Passwörtern abgeleiteten Daten, die das Gerät verlassen können, sind die optionale Prüfung auf bekannte Leaks; sie bleibt aus, sofern Sie sie nicht einschalten, und wird in Abschnitt 5 beschrieben.',
    'Der Bildschirm „Sicherheitsprüfung“ in der App kann über die k-Anonymitäts-Range-API von Have I Been Pwned prüfen, ob Ihre Passwörter in einem bekannten Leak-Korpus enthalten sind. In diesem Fall wird nur der erste Fünf-Hex-Zeichen-Abschnitt des SHA-1-Hashwerts eines Passworts gesendet; weder das Passwort noch der restliche Hashwert werden übertragen, und Antworten werden aufgefüllt, damit ihre Größe nicht zugeordnet werden kann. Diese Prüfung ist <strong>standardmäßig deaktiviert</strong> und läuft nur, wenn Sie sie über die Schaltfläche auf diesem Bildschirm einschalten; ist sie aus, wird überhaupt keine Anfrage gesendet.',
  ],
  fr: [
    'Aucune donnée de votre coffre n’est transmise à un serveur. Les seules données dérivées de vos mots de passe susceptibles de quitter l’appareil sont la vérification facultative des fuites connues, qui reste désactivée sauf si vous l’activez, et qui est décrite à la section 5.',
    'L’écran « Audit de sécurité » de l’application peut interroger Have I Been Pwned, via son API de plages à k-anonymat, pour savoir si vos mots de passe figurent dans un corpus de violations connu. Dans ce cas, seuls les cinq premiers caractères hexadécimaux de l’empreinte SHA-1 d’un mot de passe sont envoyés ; ni le mot de passe ni le reste de l’empreinte ne le sont, et les réponses sont complétées afin que leur taille ne puisse pas être corrélée. Cette vérification est <strong>désactivée par défaut</strong> et ne s’exécute que si vous l’activez avec le bouton de cet écran ; une fois désactivée, aucune requête n’est envoyée.',
  ],
  es: [
    'Nada de tu bóveda se transmite a ningún servidor. El único dato derivado de tus contraseñas que puede salir del dispositivo es la comprobación opcional de filtraciones conocidas, que permanece desactivada salvo que la actives, y que se describe en la sección 5.',
    'La pantalla « Auditoría de seguridad » de la aplicación puede consultar a Have I Been Pwned, mediante su API de rangos con k-anonimato, si tus contraseñas aparecen en un corpus de filtraciones conocido. En ese caso solo se envían los cinco primeros caracteres hexadecimales de la huella SHA-1 de una contraseña; ni la contraseña ni el resto de la huella se transmiten, y las respuestas se rellenan para que su tamaño no pueda correlacionarse. Esta comprobación está <strong>desactivada de forma predeterminada</strong> y solo se ejecuta si la activas con el botón de esa pantalla; una vez desactivada, no se envía ninguna solicitud.',
  ],
  it: [
    'Nulla del tuo vault viene trasmesso a un server. L’unico dato derivato dalle tue password che può lasciare il dispositivo è il controllo facoltativo delle violazioni note, che resta disattivato se non lo attivi tu, e che è descritto nella sezione 5.',
    'La schermata « Audit di sicurezza » dell’app può chiedere a Have I Been Pwned, tramite la sua API range a k-anonimato, se le tue password compaiono in un corpus di violazioni noto. In tal caso viene inviata solo la prima sequenza di cinque caratteri esadecimali dell’hash SHA-1 di una password; né la password né il resto dell’hash vengono trasmessi, e le risposte vengono riempite perché la loro dimensione non possa essere correlata. Il controllo è <strong>disattivato per impostazione predefinita</strong> e viene eseguito solo se lo attivi con il pulsante di quella schermata; una volta disattivato non viene inviata alcuna richiesta.',
  ],
  pt: [
    'Nada do seu cofre é transmitido a qualquer servidor. O único dado derivado das suas palavras-passe que pode sair do dispositivo é a verificação opcional de fugas conhecidas, que fica desativada a não ser que a ative, e que está descrita na secção 5.',
    'O ecrã « Auditoria de segurança » da aplicação pode consultar o Have I Been Pwned, através da sua API de intervalos com k-anonimato, para saber se as suas palavras-passe constam de um corpus de fugas conhecido. Nesse caso, é enviado apenas o primeiro conjunto de cinco caracteres hexadecimais do resumo SHA-1 de uma palavra-passe; nem a palavra-passe nem o resto do resumo são transmitidos, e as respostas são preenchidas para que o respetivo tamanho não possa ser correlacionado. Esta verificação está <strong>desativada por predefinição</strong> e só é executada se a ativar com o botão desse ecrã; depois de desativada, não é enviado qualquer pedido.',
  ],
  ru: [
    'Из вашего хранилища ничего не передаётся на сервер. Единственные данные, производные от ваших паролей, которые могут покинуть устройство, — это необязательная проверка известных утечек; она остаётся выключенной, если вы не включите её, и описана в разделе 5.',
    'Экран « Аудит безопасности » в приложении может запросить Have I Been Pwned через его range-API с k-анонимностью, чтобы узнать, встречаются ли ваши пароли в известном корпусе утечек. В этом случае отправляется только первая пятёрка шестнадцатеричных символов SHA-1-хэша пароля; ни сам пароль, ни остальная часть хэша не передаются, а ответы дополняются, чтобы их размер нельзя было сопоставить с запросом. Эта проверка <strong>по умолчанию выключена</strong> и выполняется только если вы включаете её кнопкой на этом экране; после выключения запросы не отправляются.',
  ],
  ja: [
    '保管庫の内容がサーバーへ送信されることはありません。パスワードから導出され、端末の外へ出る可能性があるデータは、任意の「既知の漏洩チェック」だけであり、あなたが有効化しない限りオフのままです（第5節で説明します）。',
    'アプリの「セキュリティ監査」画面は、Have I Been Pwned の k-匿名性レンジ API を利用して、パスワードが既知の漏洩データセットに含まれているかを確認できます。この場合送信されるのはパスワードの SHA-1 ダイジェストの先頭5文字のみで、パスワード自体もダイジェストの残りも送信されず、応答はサイズから推測できないようパディングされます。このチェックは<strong>既定でオフ</strong>であり、この画面のボタンで有効にした場合のみ実行されます。オフにするとリクエストはまったく送信されません。',
  ],
  zh: [
    '您的密码库内容不会传输到任何服务器。唯一可能离开设备的、由密码派生出的数据，是可选的已知泄露检查；除非您主动启用，否则它保持关闭，详见第5节。',
    '应用的「安全审计」界面可以通过 Have I Been Pwned 的 k-匿名范围 API 查询您的密码是否出现在已知的泄露数据集中。在这种情况下，仅会发送密码 SHA-1 摘要的前五个十六进制字符；密码本身及其余摘要内容均不会传输，响应也会进行填充处理，以避免通过响应大小进行关联。该检查<strong>默认关闭</strong>，只有在您通过该界面的按钮启用后才会运行；关闭后不会发送任何请求。',
  ],
  ko: [
    '보관함의 어떤 내용도 서버로 전송되지 않습니다. 비밀번호에서 파생되어 기기를 벗어날 수 있는 데이터는 선택적 알려진 유출 검사뿐이며, 직접 켜지 않으면 꺼져 있고 5절에서 설명합니다.',
    '앱의 「보안 감사」 화면은 k-익명성 range API를 통해 Have I Been Pwned에 비밀번호가 알려진 유출 데이터셋에 포함되어 있는지 확인할 수 있습니다. 이때 전송되는 것은 비밀번호 SHA-1 다이제스트의 앞 5자뿐이며 비밀번호 자체나 나머지 다이제스트는 전송되지 않고, 응답은 크기로 추적할 수 없도록 패딩됩니다. 이 검사는<strong>기본적으로 꺼져 있으며</strong> 해당 화면의 버튼으로 직접 켤 때만 실행됩니다. 끄면 어떤 요청도 전송되지 않습니다.',
  ],
  ar: [
    'لا يُنقل أي شيء من خزنتك إلى أي خادم. البيانات الوحيدة المشتقة من كلمات مرورك التي قد تغادر الجهاز هي التحقق الاختياري من عمليات التسريب المعروفة، وهو يبقى معطّلًا ما لم تفعّله، وهو موصوف في القسم 5.',
    'يمكن لشاشة «التدقيق الأمني» في التطبيق أن تسأل Have I Been Pwned، عبر واجهة نطاقاتها القائمة على k-anonimity، ما إذا كانت كلمات مرورك موجودة في مجموعة معروفة من عمليات التسريب. في هذه الحالة يُرسَل الجزء الأول من خمسة أحرف ست عشرية فقط من تجزئة SHA-1 لكلمة المرور؛ ولا تُرسَل كلمة المرور نفسها ولا بقية التجزئة، وتُحشو الردود حتى لا يمكن ربط حجمها بالاستعلام. هذا التحقق <strong>معطّل افتراضيًا</strong> ولا يعمل إلا إذا فعّلته بزر الشاشة نفسها؛ وبعد التعطيل لا يُرسَل أي طلب.',
  ],
};

const KEYS = ['privacy-p1-2b', 'privacy-p1-5b'];

let dictionaries = 0;
let pageParagraphs = 0;
const problems = [];

for (const [locale, texts] of Object.entries(TEXT)) {
  const file = path.join(I18N, `${locale}.json`);
  try {
    // Throws rather than writing a dictionary without the anchor key: a
    // silently replaced file here is a legal page that has lost a section, in a
    // language nobody on the project reads.
    updateJsonFile(file, (dict) => {
      if (typeof dict['privacy-p1-2'] !== 'string') {
        throw new Error(`${locale}.json privacy-p1-2 yok`);
      }
      dict[KEYS[0]] = texts[0];
      dict[KEYS[1]] = texts[1];
      return dict;
    });
  } catch (err) {
    // Reported rather than thrown, so one missing dictionary does not stop the
    // eleven that are present from being fixed.
    if (err && err.code === 'ENOENT') {
      problems.push(`${locale}.json yok`);
      continue;
    }
    throw err;
  }
  dictionaries++;
}

// The Turkish page is the readable default, so the two paragraphs go in as
// markup as well; generate-locales.cjs then writes every other language from
// the dictionaries.
updateFile(PAGE, (page) => {
  let next = page;

  for (let index = 0; index < KEYS.length; index++) {
    if (next.includes(`data-i18n="${KEYS[index]}"`)) continue;
    const anchor = index === 0 ? 'privacy-p1-2' : 'privacy-p1-5';
    const anchorTag = new RegExp(`(<p data-i18n="${anchor}">[\\s\\S]*?</p>)`);
    if (!anchorTag.test(next)) {
      problems.push(`privacy.html: ${anchor} bulunamadi`);
      continue;
    }
    next = next.replace(anchorTag, `$1\n<p data-i18n="${KEYS[index]}">${TEXT.tr[index]}</p>`);
    pageParagraphs++;
  }

  return pageParagraphs > 0 ? next : undefined;
});

if (problems.length) {
  console.error('uygulanamadi:');
  problems.forEach((p) => console.error(`  ${p}`));
  process.exit(1);
}

console.log(`${dictionaries} sozluk ve ${pageParagraphs} paragraf guncellendi.`);
console.log('Simdi: node scripts/generate-locales.cjs  (diger 11 dili sayfaya yazar)');