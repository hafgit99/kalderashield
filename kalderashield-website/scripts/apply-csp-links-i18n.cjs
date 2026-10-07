/* Moves the two internal links out of the data-i18n values.
 *
 *   node scripts/apply-csp-links-i18n.cjs
 *
 * Why this is needed at all: generate-locales.cjs rewrites root-relative internal
 * links on a localized page so they carry the locale prefix -- a visitor on
 * /de/ clicking /download/ would otherwise land on the Turkish page with a
 * language switcher still saying German. That rewrite walks every [href], which
 * includes links that live inside a data-i18n value.
 *
 * It is correct behaviour and it was correct to have it. But it means the page
 * and the dictionary diverge for exactly those two keys: the page ends up with
 * /en/privacy.html and the dictionary still holds /privacy.html, which
 * audit-static-i18n.cjs reports as "sayfada sozlukten farkli" on every locale.
 *
 * These were the only two data-i18n values on the whole site carrying a
 * root-relative link, so this is the first time the case has come up. The fix is
 * not to weaken either side of the contradiction. It is to stop putting a
 * locale-sensitive link inside a translatable string: the sentence goes in the
 * dictionary, the link goes in the markup, and the two are adjacent.
 *
 * The cost is that the sentence is split at the link, so a translator cannot
 * reorder them. That is the right trade for two occurrences on one page rather
 * than rewriting the link-prefixing that the other 264 pages depend on.
 */
const fs = require('fs');
const path = require('path');

const { apply } = require('./lib/signpath-policy-i18n.cjs');

const I18N_DIR = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');
const CODES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'tr', 'zh'];

/* csp-p1-8: the sentence up to the link, then a separate key for what follows. */
const P1_8 = {
  tr: 'Geçerli bir SignPath Foundation imzası, ikili dosyanın sürümün belirttiği depodaki kaynak koddan doğrulanabilir ve otomatik bir derleme olduğu anlamına gelir. Yazılımın denetlendiği anlamına <strong>gelmez</strong> ve uygulamaya ilişkin bir güvenlik onayı değildir. Bu proje tehdit modeli ve kalite kapısı belgeleri yayımlar, ancak tamamlanmış bağımsız bir üçüncü taraf güvenlik denetimi yoktur:',
  en: 'A valid SignPath Foundation signature means the binary is a verifiable, automated build of the source code in this repository at the commit the release names. It does <strong>not</strong> mean the software has been audited, and it is not a security endorsement of the application. This project publishes a threat model and quality-gate documentation, but has no completed independent third-party security audit:',
  de: 'Eine gültige SignPath-Foundation-Signatur bedeutet, dass die Binärdatei ein überprüfbarer, automatisierter Build des Quellcodes in diesem Repository zum vom Release genannten Commit ist. Sie bedeutet <strong>nicht</strong>, dass die Software auditiert wurde, und ist keine Sicherheitsempfehlung für die Anwendung. Dieses Projekt veröffentlicht ein Bedrohungsmodell und Qualitätssicherungs-Dokumentation, hat aber kein abgeschlossenes unabhängiges Sicherheitsaudit durch Dritte:',
  fr: "Une signature SignPath Foundation valide signifie que le binaire est un build automatisable et vérifiable du code source de ce dépôt au commit indiqué par la version. Cela ne signifie <strong>pas</strong> que le logiciel a été audité, et ce n'est pas une approbation de sécurité de l'application. Ce projet publie un modèle de menace et une documentation de qualité, mais ne dispose d'aucun audit de sécurité indépendant réalisé par un tiers :",
  es: 'Una firma válida de SignPath Foundation significa que el binario es una compilación automatizada y verificable del código fuente de este repositorio en el commit que indica la release. <strong>No</strong> significa que el software haya sido auditado, y no es una aprobación de seguridad de la aplicación. Este proyecto publica un modelo de amenazas y documentación de puertas de calidad, pero no cuenta con una auditoría de seguridad independiente completada:',
  it: 'Una firma SignPath Foundation valida significa che il binario è una build automatica e verificabile del codice sorgente di questo repository al commit indicato dalla release. <strong>Non</strong> significa che il software sia stato sottoposto ad audit, e non è un\'approvazione di sicurezza per l\'applicazione. Questo progetto pubblica un modello di minaccia e documentazione sui controlli di qualità, ma non dispone di un audit di sicurezza indipendente completato:',
  pt: 'Uma assinatura válida da SignPath Foundation significa que o binário é uma compilação automatizada e verificável do código-fonte deste repositório no commit indicado pelo lançamento. <strong>Não</strong> significa que o software tenha sido auditado, e não é uma aprovação de segurança da aplicação. Este projeto publica um modelo de ameaças e documentação de portões de qualidade, mas não tem uma auditoria de segurança independente concluída:',
  ru: 'Действительная подпись SignPath Foundation означает, что двоичный файл является проверяемой автоматической сборкой исходного кода из этого репозитория на коммите, названном в выпуске. Это <strong>не</strong> означает, что программное обеспечение было проверено, и не является подтверждением безопасности приложения. Проект публикует модель угроз и документацию по контролю качества, но не имеет завершённого независимого аудита безопасности:',
  ar: 'يعني التوقيع الساري من SignPath Foundation أن الملف التنفيذي هو بناء آلي قابل للتحقق من الشيفرة المصدرية في هذا المستودع عند الالتزام الذي يسمّيه الإصدار. وهو <strong>لا</strong> يعني أن البرمجيات خضعت لتدقيق، وليس تأكيدًا لأمان التطبيق. ينشر هذا المشروع نموذج التهديد ووثائق بوابات الجودة، لكنه لا يملك تدقيقًا أمنيًا مستقلًا مكتملًا:',
  ja: '有効な SignPath Foundation 署名は、そのバイナリが、リリースが示すコミットにおける本リポジトリのソースコードからの検証可能な自動ビルドであることを意味します。<strong>ソフトウェアが監査済み</strong>であることを意味せず、アプリケーションに対するセキュリティの推奨でもありません。本プロジェクトは脅威モデルと品質ゲート文書を公開していますが、完了した独立した第三者セキュリティ監査は持っていません:',
  ko: '유효한 SignPath Foundation 서명은 해당 바이너리가 릴리스가 명시한 커밋 시점의 이 저장소 소스 코드로부터 검증 가능한 자동 빌드임을 뜻합니다. 이는 소프트웨어가 <strong>감사되었다는 뜻이 아니며</strong>, 애플리케이션에 대한 보안 보증도 아닙니다. 이 프로젝트는 위협 모델과 품질 게이트 문서를 공개하지만, 완료된 독립 제3자 보안 감사는 없습니다:',
  zh: '有效的 SignPath Foundation 签名意味着该二进制文件是可验证的自动化构建，源自本仓库在发行版所指明提交处的源代码。这<strong>并不</strong>意味着软件经过审计，也不构成对该应用的安全背书。本项目发布了威胁模型与质量门禁文档，但没有完成的独立第三方安全审计：',
};

/* csp-p1-19: the link is mid-sentence, so both halves are kept. */
const P1_19_HEAD = {
  tr: 'KalderaShield çevrimdışı öncelikli, sıfır bilgili bir şifre yöneticisidir. Kasa içerikleri cihazda, ana paroladan türetilen anahtarlarla şifrelenir ve hiçbir zaman iletilmez. Hesap yoktur, eşitleme hizmeti yoktur, telemetri yoktur, analitik yoktur. Windows ikili dosyaları, işletim sisteminin kendi bileşenleri dışında hiçbir ağ istemcisi içermez. Ayrıntılı metin:',
  en: 'KalderaShield is an offline-first, zero-knowledge password manager. Vault contents are encrypted on the device with keys derived from the master password and are never transmitted. There is no account, no sync service, no telemetry and no analytics. The Windows binaries contain no network client of any kind beyond the operating system\'s own components. Full text:',
  de: 'KalderaShield ist ein Offline-First-Passwortmanager nach dem Prinzip des Nullwissens. Tresorinhalte werden auf dem Gerät mit aus dem Master-Passwort abgeleiteten Schlüsseln verschlüsselt und niemals übermittelt. Es gibt kein Konto, keinen Synchronisationsdienst, keine Telemetrie und keine Analyse. Die Windows-Binärdateien enthalten über die Komponenten des Betriebssystems hinaus keinerlei Netzwerk-Client. Vollständiger Text:',
  fr: "KalderaShield est un gestionnaire de mots de passe hors ligne et à connaissance nulle. Le contenu du coffre est chiffré sur l'appareil avec des clés dérivées du mot de passe principal et n'est jamais transmis. Il n'y a ni compte, ni service de synchronisation, ni télémétrie, ni analyse. Les binaires Windows ne contiennent aucun client réseau, hormis les composants du système d'exploitation lui-même. Texte complet :",
  es: 'KalderaShield es un gestor de contraseñas sin conexión y de conocimiento cero. El contenido de la bóveda se cifra en el dispositivo con claves derivadas de la contraseña maestra y nunca se transmite. No hay cuenta, ni servicio de sincronización, ni telemetría, ni analítica. Los binarios de Windows no contienen ningún cliente de red de ningún tipo salvo los componentes propios del sistema operativo. Texto completo:',
  it: "KalderaShield è un gestore di password offline-first a conoscenza zero. I contenuti della cassaforte sono cifrati sul dispositivo con chiavi derivate dalla password principale e non vengono mai trasmessi. Non c'è alcun account, alcun servizio di sincronizzazione, alcuna telemetria e alcuna analisi. I binari Windows non contengono alcun client di rete oltre ai componenti del sistema operativo stesso. Testo completo:",
  pt: 'O KalderaShield é um gestor de senhas offline-first e de conhecimento zero. O conteúdo do cofre é cifrado no dispositivo com chaves derivadas da senha mestra e nunca é transmitido. Não há conta, serviço de sincronização, telemetria nem análise. Os binários Windows não contêm qualquer cliente de rede para além dos próprios componentes do sistema operativo. Texto completo:',
  ru: 'KalderaShield — офлайн-ориентированный менеджер паролей на основе принципа «нулевого знания». Содержимое хранилища шифруется на устройстве ключами, полученными из мастер-пароля, и никогда не передаётся. У него нет учётной записи, службы синхронизации, телеметрии и аналитики. В двоичных файлах для Windows нет сетевого клиента никакого рода, кроме компонентов самой операционной системы. Полный текст:',
  ar: '‏KalderaShield هو مدير كلمات مرور يعمل دون اتصال ويقوم على المعرفة الصفرية. تُشفَّر محتويات الخزنة على الجهاز بمفاتيح مشتقّة من كلمة المرور الرئيسية ولا تُنقل أبدًا. لا يوجد حساب ولا خدمة مزامنة ولا تتبع ولا تحليل. ولا تتضمّن ملفات Windows أي عميل شبكة من أي نوع سوى مكونات نظام التشغيل نفسه. النص الكامل:',
  ja: 'KalderaShield はオフラインファーストでゼロ知識に基づくパスワードマネージャーです。保管庫の内容はデバイス上でマスターパスワードから導出された鍵により暗号化され、送信されることはありません。アカウントも、同期サービスも、テレメトリも、分析も存在しません。Windows のバイナリには、オペレーティングシステム自身のコンポーネント以外にネットワーククライアントは一切含まれていません。全文:',
  ko: 'KalderaShield는 오프라인 우선이며 제로 지식을 기반으로 한 비밀번호 관리자입니다. 보관함 내용은 기기 위에서 마스터 비밀번호에서 파생된 키로 암호화되며 절대 전송되지 않습니다. 계정도, 동기화 서비스도, 텔레메트리도, 분석도 없습니다. Windows 바이너리에는 운영 체제 자체의 구성요소를 제외한 어떤 네트워크 클라이언트도 들어 있지 않습니다. 전문:',
  zh: 'KalderaShield 是一款离线优先、零知识的密码管理器。保管库内容在设备上使用由主密码派生的密钥加密，绝不传输。它没有账户、没有同步服务、没有遥测、没有分析。Windows 二进制文件中除操作系统自身的组件外，不含任何网络客户端。完整文本见',
};

const P1_19_TAIL = {
  tr: 'Kullanıcıları etkileyen üçüncü taraf bileşenlerin davranışı LICENSE-3RD-PARTY.md ile kapsanır.',
  en: 'The behaviour of third-party components that affects users is covered by LICENSE-3RD-PARTY.md.',
  de: 'Das Verhalten Dritter, das Nutzer betrifft, ist in LICENSE-3RD-PARTY.md geregelt.',
  fr: 'Le comportement des composants tiers qui affecte les utilisateurs est couvert par LICENSE-3RD-PARTY.md.',
  es: 'El comportamiento de componentes de terceros que afecta a los usuarios está cubierto por LICENSE-3RD-PARTY.md.',
  it: 'Il comportamento dei componenti di terze parti che incid sugli utenti è coperto da LICENSE-3RD-PARTY.md.',
  pt: 'O comportamento de componentes de terceiros que afeta os utilizadores está coberto por LICENSE-3RD-PARTY.md.',
  ru: 'Поведение сторонних компонентов, затрагивающее пользователей, описано в LICENSE-3RD-PARTY.md.',
  ar: 'ويُغطّى سلوك مكوّنات الأطراف الثالثة التي تؤثر في المستخدمين في LICENSE-3RD-PARTY.md.',
  ja: '利用者に影響する第三者コンポーネントの挙動は LICENSE-3RD-PARTY.md に記載されています。',
  ko: '사용자에게 영향을 미치는 타사 구성요소의 동작은 LICENSE-3RD-PARTY.md에 정리되어 있습니다.',
  zh: '影响用户的第三方组件行为记录在 LICENSE-3RD-PARTY.md 中。',
};

/* The link labels, which now live in the markup as their own spans. */
const P1_8_LINK = {
  tr: 'Güvenlik Denetimi Durumu',
  en: 'Security audit status',
  de: 'Status des Sicherheitsaudits',
  fr: "statut de l'audit de sécurité",
  es: 'estado de la auditoría de seguridad',
  it: "stato dell'audit di sicurezza",
  pt: 'estado da auditoria de segurança',
  ru: 'статус аудита безопасности',
  ar: 'حالة التدقيق الأمني',
  ja: 'セキュリティ監査の状況',
  ko: '보안 감사 상태',
  zh: '安全审计状态',
};

const P1_19_LINK = {
  tr: 'Gizlilik Politikası',
  en: 'Privacy policy',
  de: 'Datenschutzrichtlinie',
  fr: 'Politique de confidentialité',
  es: 'Política de privacidad',
  it: 'Informativa sulla privacy',
  pt: 'Política de privacidade',
  ru: 'политика конфиденциальности',
  ar: 'سياسة الخصوصية',
  ja: 'プライバシーポリシー',
  ko: '개인정보 처리방침',
  zh: '隐私政策',
};

apply(I18N_DIR, CODES, {
  'csp-p1-8': P1_8,
  'csp-p1-8-link': P1_8_LINK,
  'csp-p1-19-head': P1_19_HEAD,
  'csp-p1-19-link': P1_19_LINK,
  'csp-p1-19-tail': P1_19_TAIL,
});
