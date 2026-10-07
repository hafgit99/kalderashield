/* Adds the code signing policy page's keys to the non-Latin-script locales.
 *
 *   node scripts/apply-signpath-policy-i18n-nonlatin.cjs
 *
 * Requires apply-signpath-policy-i18n.cjs to have run first: the audit reports
 * key parity against the English dictionary, and this file does not write English.
 *
 * Split from the Latin run only because the two files together exceed what can be
 * written in one edit. The split is by writing system rather than by page, so
 * neither half is a partial translation of the other.
 */
const fs = require('fs');
const path = require('path');

const { apply } = require('./lib/signpath-policy-i18n.cjs');

const I18N_DIR = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');

const CODES = ['ar', 'ja', 'ko', 'ru', 'zh'];

/* Identical in every locale. See apply-signpath-policy-i18n.cjs. */
const SIGNPATH_SENTENCE =
  'Free code signing provided by SignPath.io, certificate by SignPath Foundation.';

const TRANSLATIONS = {
  'csp-eyebrow': {
    ru: 'Правовая информация',
    ar: 'قانوني',
    ja: '法的情報',
    ko: '법적 고지',
    zh: '法律信息',
  },

  'csp-title': {
    ru: 'Политика подписания кода',
    ar: 'سياسة توقيع الشيفرة',
    ja: 'コード署名ポリシー',
    ko: '코드 서명 정책',
    zh: '代码签名政策',
  },

  'csp-updated': {
    ru: 'Последнее обновление: октябрь 2026 · Доступно на 12 языках.',
    ar: 'آخر تحديث: أكتوبر ٢٠٢٦ · متاح بـ ١٢ لغة.',
    ja: '最終更新: 2026年10月 · 12言語で提供。',
    ko: '마지막 업데이트: 2026년 10월 · 12개 언어로 제공됩니다.',
    zh: '最后更新：2026 年 10 月 · 提供 12 种语言。',
  },

  'csp-h2-1': {
    ru: '1. Что определяет эта политика',
    ar: '١. ما الذي تحدده هذه السياسة',
    ja: '1. このポリシーが定めること',
    ko: '1. 이 정책이 규정하는 바',
    zh: '1. 本政策规定的内容',
  },

  'csp-p1-1': {
    ru: 'На этой странице указано, какие выпускаемые артефакты KalderaShield подписываются, кем, при какой схеме хранения ключей и кто отвечает за утверждение каждой подписи. Исходная версия того же документа в репозитории: <a href="https://github.com/hafgit99/kalderashield/blob/main/CODE_SIGNING_POLICY.md" rel="noopener noreferrer">CODE_SIGNING_POLICY.md</a>',
    ar: 'توضّح هذه الصفحة أي مخرجات الإصدار الخاصة بـ KalderaShield تُوقَّع، ومن يوقّعها، وبأي طريقة لحفظ المفاتيح، ومن المسؤول عن اعتماد كل توقيع. النسخة المصدرية من الوثيقة نفسها في المستودع: <a href="https://github.com/hafgit99/kalderashield/blob/main/CODE_SIGNING_POLICY.md" rel="noopener noreferrer">CODE_SIGNING_POLICY.md</a>',
    ja: 'このページは、KalderaShield のどのリリース成果物が、誰によって、どの鍵の管理方式で署名され、各署名について誰が承認責任を負うかを示します。同じ文書のソース版はリポジトリにあります: <a href="https://github.com/hafgit99/kalderashield/blob/main/CODE_SIGNING_POLICY.md" rel="noopener noreferrer">CODE_SIGNING_POLICY.md</a>',
    ko: '이 페이지는 KalderaShield의 어떤 릴리스 산출물이 누가 어떤 키 관리 방식으로 서명하는지, 그리고 각 서명에 대해 누가 승인 책임을 지는지를 밝힙니다. 저장소에 있는 같은 문서의 원본: <a href="https://github.com/hafgit99/kalderashield/blob/main/CODE_SIGNING_POLICY.md" rel="noopener noreferrer">CODE_SIGNING_POLICY.md</a>',
    zh: '本页说明 KalderaShield 的哪些发布产物由谁签名、采用何种密钥保管方式，以及每份签名由谁负责批准。仓库中同一文档的源版本：<a href="https://github.com/hafgit99/kalderashield/blob/main/CODE_SIGNING_POLICY.md" rel="noopener noreferrer">CODE_SIGNING_POLICY.md</a>',
  },

  'csp-h2-2': {
    ru: '2. Windows',
    ar: '٢. Windows',
    ja: '2. Windows',
    ko: '2. Windows',
    zh: '2. Windows',
  },

  'csp-p1-3': {
    ru: SIGNPATH_SENTENCE,
    ar: SIGNPATH_SENTENCE,
    ja: SIGNPATH_SENTENCE,
    ko: SIGNPATH_SENTENCE,
    zh: SIGNPATH_SENTENCE,
  },

  'csp-p1-4': {
    ru: '<strong>Статус: заявка на рассмотрении.</strong> KalderaShield подал заявку в SignPath Foundation и ожидает их решения. Из этого раздела нельзя заключать, что какой-либо артефакт для Windows подписан в настоящее время. <strong>Он не подписан.</strong> Пока первая подписанная версия фактически не выпущена, честная формулировка — приведённая выше, и этот раздел обновляется <em>до</em> её выхода, а не после.',
    ar: '<strong>الحالة: الطلب قيد المراجعة.</strong> قدّم KalderaShield طلبًا إلى SignPath Foundation وينتظر قرارهم. لا يُقرأ أي جزء من هذا القسم على أنه ادعاء بأن أي مخرج|Windows موقّع حاليًا. <strong>فهو غير موقّع.</strong> إلى أن يُصدر أول إصدار موقّع فعليًا، تبقى العبارة الصادقة هي المذكورة أعلاه، ويجري تحديث هذا القسم <em>قبل</em> ذلك الإصدار لا بعده.',
    ja: '<strong>状態: 申請中。</strong> KalderaShield は SignPath Foundation に申請し、相手の決定を待っています。この節から、現在の Windows 成果物が署名済みであるとは読み取ってはなりません。<strong>署名はされていません。</strong>最初の署名済みリリースが実際に公開されるまで、正しい記述は上記のとおりであり、この節はそのリリースの<em>前</em>に更新され、後ではありません。',
    ko: '<strong>상태: 신청 중.</strong> KalderaShield는 SignPath Foundation에 신청했으며 상대의 결정을 기다리고 있습니다. 이 절에서 어떤 Windows 산출물이 현재 서명되어 있다는 주장을 읽어서는 안 됩니다. <strong>서명되어 있지 않습니다.</strong> 첫 서명 릴리스가 실제로 출시될 때까지 정직한 서술은 위와 같으며, 이 절은 그 릴리스의 <em>이전</em>에 갱신됩니다.',
    zh: '<strong>状态：申请中。</strong> KalderaShield 已向 SignPath Foundation 提交申请，正在等待对方答复。本节不得被理解为任何 Windows 产物目前已签名。<strong>它并未签名。</strong>在首个已签名版本真正发布之前，诚实的表述就是上面这一句；本节会在该版本发布<em>之前</em>更新，而非之后。',
  },

  'csp-p1-5': {
    ru: 'Подписываться будут файлы: установщик NSIS (<code>KalderaShield_&lt;версия&gt;_x64-setup.exe</code>), пакет MSI для управляемого развёртывания (<code>KalderaShield_&lt;версия&gt;_x64.msi</code>) и переносимый исполняемый файл, не требующий установки (<code>KalderaShield_&lt;версия&gt;_x64-portable.exe</code>). Все три собираются из этого репозитория и публикуются на <a href="https://github.com/hafgit99/kalderashield/releases" rel="noopener noreferrer">странице выпусков</a>. Ни один артефакт, не собранный из этого репозитория, не подписывается сертификатом этого проекта, и ни один сторонний двоичный файл не переподписывается им.',
    ar: 'الملفات التي ستُوقَّع هي مُثبِّت NSIS (<code>KalderaShield_&lt;الإصدار&gt;_x64-setup.exe</code>) وحزمة MSI للنشر المُدار (<code>KalderaShield_&lt;الإصدار&gt;_x64.msi</code>) والملف التنفيذي المحمول الذي لا يحتاج إلى تثبيت (<code>KalderaShield_&lt;الإصدار&gt;_x64-portable.exe</code>). تُبنى الملفات الثلاثة من هذا المستودع وتُنشر في <a href="https://github.com/hafgit99/kalderashield/releases" rel="noopener noreferrer">صفحة الإصدارات</a>. ولا يُوقَّع أي مُخرَج لم يُبنَ من هذا المستودع بشهادة هذا المشروع، ولا يُعاد توقيع أي ملف ثنائي تابع لجهة أخرى بها.',
    ja: '署名されるファイルは、NSIS インストーラー（<code>KalderaShield_&lt;バージョン&gt;_x64-setup.exe</code>）、一元管理パッケージ向け MSI パッケージ（<code>KalderaShield_&lt;バージョン&gt;_x64.msi</code>）、そしてインストール不要のポータブル実行ファイル（<code>KalderaShield_&lt;バージョン&gt;_x64-portable.exe</code>）です。三つともこのリポジトリからビルドされ、<a href="https://github.com/hafgit99/kalderashield/releases" rel="noopener noreferrer">リリースページ</a>で公開されます。このリポジトリからビルドされていない成果物が本プロジェクトの証明書で署名されることはなく、第三者のバイナリをこの証明書で再署名することもありません。',
    ko: '서명될 파일은 NSIS 설치 관리자(<code>KalderaShield_&lt;버전&gt;_x64-setup.exe</code>), 관리형 배포용 MSI 패키지(<code>KalderaShield_&lt;버전&gt;_x64.msi</code>), 그리고 설치가 필요 없는 휴대형 실행 파일(<code>KalderaShield_&lt;버전&gt;_x64-portable.exe</code>)입니다. 셋 다 이 저장소에서 빌드되어 <a href="https://github.com/hafgit99/kalderashield/releases" rel="noopener noreferrer">릴리스 페이지</a>에 게시됩니다. 이 저장소에서 빌드되지 않은 산출물은 이 프로젝트의 인증서로 서명되지 않으며, 제3자 바이너리를 이 인증서로 재서명하지도 않습니다.',
    zh: '将被签名的文件是 NSIS 安装程序（<code>KalderaShield_&lt;版本&gt;_x64-setup.exe</code>）、用于受管部署的 MSI 包（<code>KalderaShield_&lt;版本&gt;_x64.msi</code>）以及无需安装的便携可执行文件（<code>KalderaShield_&lt;版本&gt;_x64-portable.exe</code>）。三者均由本仓库构建，并在<a href="https://github.com/hafgit99/kalderashield/releases" rel="noopener noreferrer">发行页面</a>发布。凡非由本仓库构建的产物，一律不以本项目证书签名；也不会用该证书对任何第三方二进制文件重新签名。',
  },

  'csp-p1-6': {
    ru: '<strong>Хранение ключа:</strong> закрытый ключ создаётся и хранится в HSM компании SignPath. Этот проект никогда не хранит его, не экспортирует и не передаёт ни сборщику, ни машине разработчика. Подписание выполняется на стороне SignPath в ответ на запрос на подпись, который отправляет CI этого репозитория и который утверждает человек.',
    ar: '<strong>حفظ المفتاح:</strong> يُولَّد المفتاح الخاص ويُحفظ في وحدة SignPath للأجهزة الصلبة (HSM). لا يحتفظ هذا المشروع به أبدًا، ولا يصدّره، ولا ينقله إلى وكيل بناء أو إلى جهاز مطوّر. يتم التوقيع على جانب SignPath استجابةً لطلب توقيع يرسله التكامل المستمر لهذا المستودع ويوافق عليه شخص.',
    ja: '<strong>鍵の管理:</strong>秘密鍵は SignPath の HSM 上で生成され、保管されます。本プロジェクトは鍵を一切保持せず、エクスポートもせず、ビルドランナーや開発者マシンに送信することもありません。署名は、本リポジトリの CI が送信し、責任者が承認した署名リクエストに応えて、SignPath 側で行われます。',
    ko: '<strong>키 관리:</strong> 개인 키는 SignPath의 HSM에서 생성되고 보관됩니다. 이 프로젝트는 그 키를 보유하지도, 내보내지도, 빌드 러너나 개발자 컴퓨터로 전달하지도 않습니다. 서명은 이 저장소의 CI가 제출하고 사람이 승인한 서명 요청에 따라 SignPath 측에서 이루어집니다.',
    zh: '<strong>密钥保管：</strong>私钥在 SignPath 的 HSM 中生成并保存。本项目从不持有该密钥，从不导出，也绝不将其传递给构建运行器或开发人员机器。签名在 SignPath 一侧进行，响应的是本仓库 CI 提交并由人工批准的签名请求。',
  },

  'csp-p1-7': {
    ru: '<strong>Цепочка:</strong> отправляется тег версии → GitHub Actions собирает файлы (рабочие процессы публичны, сторонние действия закреплены по SHA коммита, права токенов только для чтения) → сборка загружает их в SignPath и открывает запрос на подпись, не подписывая → Фрегебер утверждает или отклоняет → SignPath подписывает сертификатом Foundation → подписанный файл публикуется вместе с <code>SHA256SUMS.txt</code>. Каждый выпуск требует ручного утверждения; автоматической подписи без участия человека нет и не будет.',
    ar: '<strong>السلسلة:</strong> يُدفع وسم إصدار ← تبني GitHub Actions الملفات (مسارات العمل علنية، والإجراءات الخارجية مثبَّتة بصيغة SHA للالتزام، وصلاحيات الرمز للقراءة فقط) ← يرفع البناء الملفات إلى SignPath ويفتح طلب توقيع دون توقيع ← يعتمده معتمد أو يرفضه ← توقّع SignPath بشهادة Foundation ← يُنشر الملف الموقّع مع <code>SHA256SUMS.txt</code>. يتطلب كل إصدار موافقة يدوية، ولا يوجد مسار توقيع غير مراقَب ولن يُضاف.',
    ja: '<strong>連鎖:</strong> バージョンタグを push → GitHub Actions がファイルをビルド（ワークフローは公開、第三者アクションはコミット SHA で固定、トークン権限は読み取り専用）→ ビルドが SignPath へアップロードして署名リクエストを発行（署名はしない）→ 承認者が承認または却下 → SignPath が Foundation 証明書で署名 → 署名済みファイルを <code>SHA256SUMS.txt</code> と共に公開。すべてのリリースで人手による承認が必要です。無人の署名経路は存在せず、近い将来も追加されません。',
    ko: '<strong>쇄도:</strong> 버전 태그를 푸시함 → GitHub Actions가 파일을 빌드함(워크플로는 공개이고, 타사 액션은 커밋 SHA로 고정되어 있으며, 토큰 권한은 읽기 전용) → 빌드가 SignPath에 업로드하고 서명 요청을 열며, 서명하지는 않음 → 승인자가 승인 또는 거부 → SignPath가 Foundation 인증서로 서명 → 서명된 파일을 <code>SHA256SUMS.txt</code>와 함께 게시. 모든 릴리스에는 수동 승인이 필요하며, 무인 서명 경로는 없고 앞으로도 추가하지 않습니다.',
    zh: '<strong>链条：</strong>推送版本标签 → GitHub Actions 构建这些文件（工作流是公开的，第三方 action 按 commit SHA 固定，令牌权限为只读）→ 构建将文件上传至 SignPath 并发起签名请求，但自身不签名 → 一位 Approver 批准或拒绝 → SignPath 使用 Foundation 证书签名 → 已签名文件与 <code>SHA256SUMS.txt</code> 一并发布。每个发行版都需要人工批准；不存在无人值守的签名路径，也不会新增。',
  },

  'csp-p1-8': {
    ru: 'Действительная подпись SignPath Foundation означает, что двоичный файл является проверяемой автоматической сборкой исходного кода из этого репозитория на коммите, названном в выпуске. Это <strong>не</strong> означает, что программное обеспечение было проверено, и не является подтверждением безопасности приложения. Проект публикует модель угроз и документацию по контролю качества, но не имеет завершённого независимого аудита безопасности: <a href="/guvenlik/denetim-durumu/">статус аудита безопасности</a>.',
    ar: 'يعني التوقيع الساري من SignPath Foundation أن الملف التنفيذي هو بناء آلي قابل للتحقق من الشيفرة المصدرية في هذا المستودع عند الالتزام الذي يسمّيه الإصدار. وهو <strong>لا</strong> يعني أن البرمجيات خضعت لتدقيق، وليس تأصيدًا لأمان التطبيق. ينشر هذا المشروع نموذج التهديد ووثائق بوابات الجودة، لكنه لا يملك تدقيق أمني مستقلًا مكتملًا: <a href="/guvenlik/denetim-durumu/">حالة التدقيق الأمني</a>.',
    ja: '有効な SignPath Foundation 署名は、そのバイナリが、リリースが示すコミットにおける本リポジトリのソースコードからの検証可能な自動ビルドであることを意味します。<strong>ソフトウェアが監査済み</strong>であることを意味せず、アプリケーションに対するセキュリティの推奨でもありません。本プロジェクトは脅威モデルと品質ゲート文書を公開していますが、完了した独立した第三者セキュリティ監査は持っていません: <a href="/guvenlik/denetim-durumu/">セキュリティ監査の状況</a>。',    ko: '유효한 SignPath Foundation 서명은 해당 바이너리가 릴리스가 명시한 커밋 시점의 이 저장소 소스 코드로부터 검증 가능한 자동 빌드임을 뜻합니다. 이는 소프트웨어가 <strong>감사되었다는 뜻이 아니며</strong>, 애플리케이션에 대한 보안 보증도 아닙니다. 이 프로젝트는 위협 모델과 품질 게이트 문서를 공개하지만, 완료된 독립 제3자 보안 감사는 없습니다: <a href="/guvenlik/denetim-durumu/">보안 감사 상태</a>.',
    zh: '有效的 SignPath Foundation 签名意味着该二进制文件是可验证的自动化构建，源自本仓库在发行版所指明提交处的源代码。这<strong>并不</strong>意味着软件经过审计，也不构成对该应用的安全背书。本项目发布了威胁模型与质量门禁文档，但没有完成的独立第三方安全审计：<a href="/guvenlik/denetim-durumu/">安全审计状态</a>。',
  },

  'csp-h2-3': {
    ru: '3. Роли команды',
    ar: '٣. أدوار الفريق',
    ja: '3. チームの役割',
    ko: '3. 팀 역할',
    zh: '3. 团队角色',
  },

  'csp-p1-9': {
    ru: 'KalderaShield поддерживается одним человеком. Это указано здесь, а не представлено как команда, потому что перечисленные ниже роли — те, которых требует SignPath, и единственный сопровождающий может заполнить их честно только в одиночку. Все учётные записи с правом записи в этот репозиторий используют многофакторную аутентификацию.',
    ar: 'يشرف على KalderaShield شخص واحد. يُذكر ذلك هنا بدل تقديمه كفريق، لأن الأدوار أدناه هي الأدوار التي يطلبها SignPath، ولا يستطيع المشرف الوحيد ملؤها إلا بشكل صادق منفرد. تستخدم جميع الحسابات ذات صلاحية الكتابة في هذا المستودع المصادقة متعددة العوامل.',
    ja: 'KalderaShield は一人が保守しています。これはチームとして提示するのではなく、ここではっきり記載しています。以下は SignPath が求める役割であり、単独のメンテナが正直に埋められるのはそれらのみだからです。このリポジトリへの書き込み権限を持つすべてのアカウントは、多要素認証を使用しています。',
    ko: 'KalderaShield는 한 사람이 유지 관리합니다. 이를 팀으로 제시하지 않고 여기에 분명히 밝히는 이유는, 아래 역할들이 SignPath가 요구하는 것이고 단독 유지 관리자가 정직하게 채울 수 있는 것도 그뿐이기 때문입니다. 이 저장소에 쓰기 권한이 있는 모든 계정은 다단계 인증을 사용합니다.',
    zh: 'KalderaShield 由一人维护。此处如实说明，而非包装成团队，因为下面这些角色正是 SignPath 所要求的，而唯一的维护者只有独自一人才能诚实地承担。所有对本仓库拥有写入权限的账户均已启用多重身份验证。',
  },

  'csp-p1-11': {
    ru: '<p><strong>Авторы</strong> — люди, которые могут изменять исходный код без дополнительной проверки:</p>\n      <ul>\n        <li><code>hafgit99</code> — <a href="https://github.com/hafgit99" rel="noopener noreferrer">github.com/hafgit99</a></li>\n      </ul>\n      <p>Это единственная учётная запись с правом записи. Репозиторием владеет личная учётная запись, а не организация, поэтому путь записи — одна личность с включённой MFA.</p>',
    ar: '<p><strong>المؤلفون</strong> — أشخاص يمكنهم تعديل الشيفرة المصدرية دون مراجعة إضافية:</p>\n      <ul>\n        <li><code>hafgit99</code> — <a href="https://github.com/hafgit99" rel="noopener noreferrer">github.com/hafgit99</a></li>\n      </ul>\n      <p>هذا هو الحساب الوحيد الذي يملك صلاحية الكتابة. المستودع مملوك لحساب شخصي لا لمنظمة، لذا فإن مسار الكتابة هو هوية واحدة عليها مصادقة متعددة العوامل.</p>',
    ja: '<p><strong>著者 (Authors)</strong> — 追加のレビューなしにソースコードを変更できる人:</p>\n      <ul>\n        <li><code>hafgit99</code> — <a href="https://github.com/hafgit99" rel="noopener noreferrer">github.com/hafgit99</a></li>\n      </ul>\n      <p>書き込み権限を持つアカウントはこれだけです。リポジトリは組織ではなく個人のアカウントが所有しているため、書き込み経路は MFA が有効な単一の身元です。</p>',
    ko: '<p><strong>작성자 (Authors)</strong> — 추가 검토 없이 소스 코드를 수정할 수 있는 사람:</p>\n      <ul>\n        <li><code>hafgit99</code> — <a href="https://github.com/hafgit99" rel="noopener noreferrer">github.com/hafgit99</a></li>\n      </ul>\n      <p>쓰기 권한이 있는 유일한 계정입니다. 이 저장소는 조직이 아니라 개인 계정이 소유하므로, 쓰기 경로는 MFA가 적용된 단일 신원입니다.</p>',
    zh: '<p><strong>作者（Authors）</strong> — 无需额外审查即可修改源代码的人员：</p>\n      <ul>\n        <li><code>hafgit99</code> — <a href="https://github.com/hafgit99" rel="noopener noreferrer">github.com/hafgit99</a></li>\n      </ul>\n      <p>这是唯一拥有写入权限的账户。本仓库由个人账户而非组织所有，因此写入路径是一个启用了多重身份验证的单一身份。</p>',
  },

  'csp-p1-13': {
    ru: '<p><strong>Рецензенты</strong> — люди, проверяющие каждое изменение, предложенное некоммитером, до слияния:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p>Сейчас нет участников без права коммита, так что эта роль на практике не просто немногочисленна, а пуста.</p>',
    ar: '<p><strong>المراجعون</strong> — أشخاص يراجعون كل تغيير يقترحه من لا يملك صلاحية الالتزام قبل دمجه:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p>لا يوجد حاليًا مساهمون بلا صلاحية التزام، لذا فإن هذا الدور عمليًا ليس ضئلًا فحسب بل شاغر.</p>',
    ja: '<p><strong>レビュアー (Reviewers)</strong> — コミッター以外が提案したすべての変更を、マージ前にレビューする人:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p>現在コミット権限のない貢献者はいないため、この役割は単に薄いというだけでなく、実質的に空いています。</p>',
    ko: '<p><strong>검토자 (Reviewers)</strong> — 커밋 권한이 없는 사람이 제안한 모든 변경을 병합 전에 검토하는 사람:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p>현재 커밋 권한이 없는 기여자가 없으므로, 이 역할은 희박할 뿐 아니라 사실상 비어 있습니다.</p>',
    zh: '<p><strong>审查者（Reviewers）</strong> — 在合并前审查无提交权限者提出的每一项更改的人员：</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p>目前没有无提交权限的贡献者，因此该角色与其说人手稀少，不如说实际上是空的。</p>',
  },

  'csp-p1-15': {
    ru: '<p><strong>Утверждающие</strong> — люди, утверждающие каждый запрос на подпись до подписания артефакта:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p><strong>Известный пробел:</strong> когда все три роли у одного человека, автор кода сам утверждает и его подпись. Модель SignPath предполагает, что утверждающий «вызывает доверие всей команды», а это предполагает более одного участника. Второй утверждающий запланирован, но пока не добавлен. Тот, кто считает это препятствием, должен сказать об этом сейчас, а не после одобрения.</p>',
    ar: '<p><strong>المعتمدون</strong> — أشخاص يعتمدون كل طلب توقيع قبل توقيع المُخرَج:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p><strong>ثغرة معروفة:</strong> عندما يحمل شخص واحد الأدوار الثلاثة، فإن من يكتب الشيفرة هو نفسه من يعتمد توقيعها. تفترض نموذج SignPath أن المعتمد «موثوق به من الفريق بأسره»، وهو ما يفترض أكثر من عضو واحد. إضافة معتمد ثانٍ مخطط لها ولم تتم بعد. ومن يعتبر ذلك سببًا للإقصاء ينبغي أن يقوله الآن لا بعد الموافقة.</p>',
    ja: '<p><strong>承認者 (Approvers)</strong> — 成果物が署名される前に各署名リクエストを承認する人:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p><strong>既知の不足:</strong> 三つの役割を同一人物が兼ねているため、コードを書く人が自分の署名も承認してしまいます。SignPath のモデルは承認者が「チーム全体の信頼される人」であることを前提としており、それは複数人のチームメンバーが存在することを前提としており、第二の承認者を追加する計画はありますが、まだ実現していません。これを不合格の理由と考える審査者は、承認の後にではなく今言うべきです。</p>',
    ko: '<p><strong>승인자 (Approvers)</strong> — 산출물이 서명되기 전에 모든 서명 요청을 승인하는 사람:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p><strong>알려진 한계:</strong> 세 가지 역할을 한 사람이 겸하므로, 코드를 작성하는 사람이 자신의 서명까지 승인합니다. SignPath의 모델은 승인자가 "팀 전체로부터 신뢰받는 사람"이라는 전제를 깔고 있으며, 이는 팀 구성원이 한 명보다 많다는 뜻입니다. 두 번째 승인자를 추가할 계획은 있으나 아직 이루어지지 않았습니다. 이것을 부적격 사유로 보는 심사자는 승인 후가 아니라 지금 말해야 합니다.</p>',
    zh: '<p><strong>批准人（Approvers）</strong> — 在产物被签名前批准每份签名请求的人员：</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p><strong>已知缺口：</strong>三个角色都由同一人承担，编写代码的人也就批准了自己的签名。SignPath 的模型假定 Approver 是「受全团队信任」的人，而这预设了团队成员不止一位。增设第二名 Approver 的计划已有，但尚未完成。认为这一点构成否决理由的审查者，应当现在就提出，而不是等到批准之后。</p>',
  },

  'csp-h2-4': {
    ru: '4. Политика конфиденциальности',
    ar: '٤. سياسة الخصوصية',
    ja: '4. プライバシーポリシー',
    ko: '4. 개인정보 처리방침',
    zh: '4. 隐私政策',
  },

  'csp-p1-18': {
    ru: '<strong>Формулировкой, которую требует SignPath: эта программа не передаёт никакую информацию в другие сетевые системы, если это прямо не затребовано пользователем или лицом, устанавливающим либо эксплуатирующим её.</strong>',
    ar: '<strong>بالعبارة التي تطلبها SignPath: لن ينقل هذا البرنامج أي معلومات إلى أنظمة شبكية أخرى إلا إذا طلب ذلك المستخدم أو الشخص الذي يثبّته أو يشغّله تحديدًا.</strong>',
    ja: '<strong>SignPath が求める表現で: 本プログラムは、ユーザーまたはこれをインストール・運用する人が明示的に求める場合を除き、他のネットワーク接続システムに何らの情報もも転送しません。</strong>',
    ko: '<strong>SignPath가 요구하는 표현 그대로: 이 프로그램은 사용자가, 또는 이를 설치하거나 운영하는 사람이 명시적으로 요청하지 않는 한 다른 네트워크 연결 시스템으로 어떤 정보도 전송하지 않습니다.</strong>',
    zh: '<strong>按 SignPath 要求的措辞：本程序不会将任何信息传输到其他联网系统，除非用户或安装、运行本程序的人明确提出要求。</strong>',
  },

  'csp-p1-19': {
    ru: 'KalderaShield — офлайн-ориентированный менеджер паролей на основе принципа нулевого знания. Содержимое хранилища шифруется на устройстве ключами, полученными из мастер-пароля, и никогда не передаётся. Нет ни учётной записи, ни службы синхронизации, ни телеметрии, ни аналитики. Двоичные файлы для Windows не содержат сетевого клиента никакого рода, кроме компонентов самой операционной системы. Полный текст: <a href="/privacy.html">политика конфиденциальности</a>. Поведение сторонних компонентов, затрагивающее пользователей, описано в <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE-3RD-PARTY.md" rel="noopener noreferrer">LICENSE-3RD-PARTY.md</a>.',
    ar: '‏KalderaShield هو مدير كلمات مرور يعمل دون اتصال ويقوم على المعرفة الصفرية. تُشفَّر محتويات الخزنة على الجهاز بمفاتيح مشتقّة من كلمة المرور الرئيسية ولا تُنقل أبدًا. لا يوجد حساب ولا خدمة مزامنة ولا تتبع ولا تحليل. ولا تتضمّن ملفات Windows أي عميل شبكة من أي نوع سوى مكونات نظام التشغيل نفسه. النص الكامل: <a href="/privacy.html">سياسة الخصوصية</a>. ويغطى سلوك مكوّنات الأطراف الثالثة التي تؤثر في المستخدمين في <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE-3RD-PARTY.md" rel="noopener noreferrer">LICENSE-3RD-PARTY.md</a>.',
    ja: 'KalderaShield はオフラインファーストでゼロ知識に基づくパスワードマネージャーです。保管庫の内容はデバイス上でマスターパスワードから導出された鍵により暗号化され、送信されることはありません。アカウントも、同期サービスも、テレメトリも、分析も存在しません。Windows のバイナリには、オペレーティングシステム自身のコンポーネント以外にネットワーククライアントは一切含まれていません。全文: <a href="/privacy.html">プライバシーポリシー</a>。利用者に影響する第三者コンポーネントの挙動は <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE-3RD-PARTY.md" rel="noopener noreferrer">LICENSE-3RD-PARTY.md</a> に記載されています。',
    ko: 'KalderaShield는 오프라인 우선이며 제로 지식을 기반으로 한 비밀번호 관리자입니다. 보관함 내용은 기기 위에서 마스터 비밀번호에서 파생된 키로 암호화되며 절대 전송되지 않습니다. 계정도, 동기화 서비스도, 텔레메트리도, 분석도 없습니다. Windows 바이너리에는 운영 체제 자체의 구성요소를 제외한 어떤 네트워크 클라이언트도 들어 있지 않습니다. 전문: <a href="/privacy.html">개인정보 처리방침</a>. 사용자에게 영향을 미치는 타사 구성요소의 동작은 <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE-3RD-PARTY.md" rel="noopener noreferrer">LICENSE-3RD-PARTY.md</a>에 정리되어 있습니다.',
    zh: 'KalderaShield 是一款离线优先、零知识的密码管理器。保管库内容在设备上使用由主密码派生的密钥加密，绝不传输。它没有账户、没有同步服务、没有遥测、没有分析。Windows 二进制文件中除操作系统自身的组件外，不含任何网络客户端。完整文本见<a href="/privacy.html">隐私政策</a>。影响用户的第三方组件行为记录在<a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE-3RD-PARTY.md" rel="noopener noreferrer">LICENSE-3RD-PARTY.md</a>中。',
  },

  'csp-h2-5': {
    ru: '5. Другие платформы',
    ar: '٥. منصات أخرى',
    ja: '5. その他のプラットフォーム',
    ko: '5. 다른 플랫폼',
    zh: '5. 其他平台',
  },

  'csp-p1-21': {
    ru: '<strong>macOS</strong> — артефакты подписываются Apple Developer ID и нотарифицируются Apple. Сертификат ещё не выпущен, поэтому ни один артефакт macOS не подписан и ни один не опубликован. <strong>Linux</strong> — <code>.deb</code>, <code>.rpm</code> и <code>.AppImage</code> публикуются с отсоединёнными подписями GPG (<code>.sig</code>), SBOM и пакеты браузерных расширений — с бесподписными подписями Sigstore (<code>.sigstore.json</code>). <strong>Android</strong> — релизные APK подписываются хранилищем ключей, находящимся в секретах GitHub Actions; подпись Android отделена от Authenticode. Ни одна платформа не описывается как подписанная, пока она таковой не является.',
    ar: '<strong>macOS</strong> — تُوقَّع المخرجات بمعرّف Apple Developer وتُوثَّق من Apple. لم تُصدر الشهادة بعد، فلا يوجد أي مخرج macOS موقّع ولا أي منها منشور. <strong>Linux</strong> — يُنشر <code>.deb</code> و<code>.rpm</code> و<code>.AppImage</code> بتوقيعات GPG منفصلة (<code>.sig</code>)؛ وتُنشر SBOM وحزم إضافات المتصفح بتوقيعات Sigstore بلا مفتاح (<code>.sigstore.json</code>). <strong>Android</strong> — تُوقَّع حزم APK بنسخ الإصدار بمخزن مفاتيح محفوظ في أسرار GitHub Actions؛ وتوقيع Android منفصل عن Authenticode. لا تُوصف أي منصة بأنها موقَّعة حتى تصبح كذلك.',
    ja: '<strong>macOS</strong> — 成果物は Apple Developer ID で署名され、Apple が notarize します。証明書はまだ発行されていないため、署名済みの macOS 成果物は存在せず、公開されているものもありません。<strong>Linux</strong> — <code>.deb</code>、<code>.rpm</code>、<code>.AppImage</code> は切り離された GPG 署名（<code>.sig</code>）付きで、SBOM とブラウザ拡張パッケージは鍵なし Sigstore 署名（<code>.sigstore.json</code>）付きで公開されます。<strong>Android</strong> — リリース APK は GitHub Actions のシークレットに保管されたリリース用 keystore で署名され、Android の署名は Authenticode とは別物です。実際に署名されるまで、どのプラットフォームも署名済みとは説明されません。',
    ko: '<strong>macOS</strong> — 산출물은 Apple Developer ID로 서명되고 Apple이 공증을 수행합니다. 인증서가 아직 발급되지 않았으므로 서명된 macOS 산출물은 없고, 게시된 것도 없습니다. <strong>Linux</strong> — <code>.deb</code>, <code>.rpm</code>, <code>.AppImage</code>은 분리된 GPG 서명(<code>.sig</code>)으로, SBOM과 브라우저 확장 패키지는 키 없는 Sigstore 서명(<code>.sigstore.json</code>)으로 게시됩니다. <strong>Android</strong> — 릴리스 APK는 GitHub Actions 시크릿에 보관된 릴리스 키 저장소로 서명되며, Android 서명은 Authenticode와 별개입니다. 실제로 서명되기 전까지 어떤 플랫폼도 서명되었다고 기술하지 않습니다.',
    zh: '<strong>macOS</strong> — 产物使用 Apple Developer ID 签名并由 Apple 公证。证书尚未签发，因此没有任何 macOS 产物已签名，也没有发布任何 macOS 产物。<strong>Linux</strong> — <code>.deb</code>、<code>.rpm</code>、<code>.AppImage</code> 以分离式 GPG 签名（<code>.sig</code>）发布；SBOM 与浏览器扩展包以无密钥 Sigstore 签名（<code>.sigstore.json</code>）发布。<strong>Android</strong> — 发行版 APK 使用保存在 GitHub Actions 机密中的发行密钥库签名；Android 签名与 Authenticode 相互独立。任何平台在真正签名之前，都不会被描述为已签名。',
  },

  'csp-p1-24': {
    ru: '<strong>Текущий статус:</strong> Linux, Android и браузерное расширение опубликованы и подписаны. <strong>Windows не опубликован и не подписан</strong> (заявка на рассмотрении). macOS не опубликован и не подписан (сертификат ещё не выпущен).',
    ar: '<strong>الحالة الحالية:</strong> نُشرت Linux وAndroid وإضافة المتصفح وهي موقَّعة. <strong>Windows لم تُنشر ولم تُوقَّع</strong> (الطلب قيد المراجعة). وmacOS لم تُنشر ولم تُوقَّع (لم تُصدر الشهادة بعد).',
    ja: '<strong>現在の状況:</strong> Linux、Android、ブラウザ拡張機能は公開済みで署名済みです。<strong>Windows は未公開・未署名</strong>（申請中）。macOS は未公開・未署名です（証明書未発行）。',
    ko: '<strong>현재 상태:</strong> Linux, Android, 브라우저 확장은 게시되어 있고 서명되어 있습니다. <strong>Windows는 게시되지 않았고 서명도 없습니다</strong>(신청 중). macOS는 게시되지 않았고 서명도 없습니다(인증서 미발급).',
    zh: '<strong>当前状态：</strong>Linux、Android 和浏览器扩展已发布并已签名。<strong>Windows 未发布且未签名</strong>（申请中）。macOS 未发布且未签名（证书尚未签发）。',
  },

  'csp-p1-25': {
    ru: 'Артефакты для Windows не публикуются, потому что конвейер выпуска считает неподписанный настольный выпуск ошибкой, а не отгружает его. Fail-closed-шлюз конвейера описан в <a href="https://github.com/hafgit99/kalderashield/blob/main/docs/CODE_SIGNING_GUIDE_2026.md" rel="noopener noreferrer">Руководстве по подписанию кода и артефактов</a>, а рабочий процесс сборки без подписи (<code>.github/workflows/build-windows-unsigned.yml</code>) намеренно неспособен опубликовать выпуск.',
    ar: 'لا تُنشر مخرجات Windows لأن سلسلة الإصدار تتعامل مع إصدار سطح مكتب غير موقّع كخطأ بدل شحنه. والبوابة المغلقة عند الفشل موثّقة في <a href="https://github.com/hafgit99/kalderashield/blob/main/docs/CODE_SIGNING_GUIDE_2026.md" rel="noopener noreferrer">دليل توقيع الشيفرة والمخرجات</a>، ومسار البناء غير الموقّع (<code>.github/workflows/build-windows-unsigned.yml</code>) مصمم عمدًا بحيث لا يستطيع نشر أي إصدار.',
    ja: 'Windows の成果物が公開されていないのは、リリースパイプラインが未署名のデスクトップリリースを配送するのではなく失敗として扱うからです。パイプラインの fail-closed ゲートは <a href="https://github.com/hafgit99/kalderashield/blob/main/docs/CODE_SIGNING_GUIDE_2026.md" rel="noopener noreferrer">コード署名と成果物署名ガイド</a> に記載されており、未署名ビルドのワークフロー（<code>.github/workflows/build-windows-unsigned.yml</code>）は意図的にリリースを公開できないようにしています。',
    ko: 'Windows 산출물을 게시하지 않는 이유는, 릴리스 파이프라인이 서명되지 않은 데스크톱 릴리스를 배송하는 대신 실패로 취급하기 때문입니다. 파이프라인의 fail-closed 게이트는 <a href="https://github.com/hafgit99/kalderashield/blob/main/docs/CODE_SIGNING_GUIDE_2026.md" rel="noopener noreferrer">코드 및 산출물 서명 가이드</a>에 문서화되어 있으며, 서명 없는 빌드 워크플로(<code>.github/workflows/build-windows-unsigned.yml</code>)는 의도적으로 릴리스를 게시할 수 없도록 설계되었습니다.',
    zh: 'Windows 产物之所以未发布，是因为发布流水线把未签名的桌面发行版视为失败，而不是将其发布出去。该流水线的 fail-closed 闸门记录在<a href="https://github.com/hafgit99/kalderashield/blob/main/docs/CODE_SIGNING_GUIDE_2026.md" rel="noopener noreferrer">代码签名与产物签名指南</a>中，而无签名构建工作流（<code>.github/workflows/build-windows-unsigned.yml</code>）被刻意设计成无法发布任何发行版。',
  },

  'csp-h2-9': {
    ru: '6. Как сообщить о проблеме',
    ar: '٦. الإبلاغ عن مشكلة',
    ja: '6. 問題の報告',
    ko: '6. 문제 신고',
    zh: '6. 报告问题',
  },

  'csp-p1-26': {
    ru: 'Если вы считаете, что артефакт, подписанный сертификатом SignPath Foundation, нарушает эту политику, сообщите об этом на <a href="mailto:support@signpath.io">support@signpath.io</a>, указав хеш артефакта и причину. По всем прочим вопросам об этих артефактах используйте <a href="mailto:security@kalderashield.com">security@kalderashield.com</a>; порядок раскрытия описан в <a href="https://github.com/hafgit99/kalderashield/blob/main/SECURITY.md" rel="noopener noreferrer">SECURITY.md</a>.',
    ar: 'إذا كنت تعتقد أن مُخرَجًا موقَّعًا بشهادة SignPath Foundation يخالف هذه السياسة، فأبلغ عنه إلى <a href="mailto:support@signpath.io">support@signpath.io</a> مع بصمة المُخرَج وسبب الاعتراض. وأي أمر آخر يخص هذه المُخرجات فاستخدم <a href="mailto:security@kalderashield.com">security@kalderashield.com</a>؛ وعملية الإفصاح موضّحة في <a href="https://github.com/hafgit99/kalderashield/blob/main/SECURITY.md" rel="noopener noreferrer">SECURITY.md</a>.',
    ja: 'SignPath Foundation の証明書で署名された成果物がこのポリシーに違反していると思う場合は、そのハッシュと理由を添えて <a href="mailto:support@signpath.io">support@signpath.io</a> へ報告してください。これらの成果物に関するその他の事項は <a href="mailto:security@kalderashield.com">security@kalderashield.com</a> へ連絡してください。開示の手順は <a href="https://github.com/hafgit99/kalderashield/blob/main/SECURITY.md" rel="noopener noreferrer">SECURITY.md</a> にあります。',
    ko: 'SignPath Foundation 인증서로 서명된 산출물이 이 정책을 위반한다고 생각한다면, 해당 산출물의 해시와 사유를 함께 <a href="mailto:support@signpath.io">support@signpath.io</a>로 보고하십시오. 이 산출물에 관한 그 밖의 사항은 <a href="mailto:security@kalderashield.com">security@kalderashield.com</a>을 사용하시면 되며, 공개 절차는 <a href="https://github.com/hafgit99/kalderashield/blob/main/SECURITY.md" rel="noopener noreferrer">SECURITY.md</a>에 있습니다.',
    zh: '如果你认为某个以 SignPath Foundation 证书签名的产物违反了本政策，请将该产物的哈希值和理由发送至 <a href="mailto:support@signpath.io">support@signpath.io</a>。关于这些产物的其他任何问题，请使用 <a href="mailto:security@kalderashield.com">security@kalderashield.com</a>；披露流程见 <a href="https://github.com/hafgit99/kalderashield/blob/main/SECURITY.md" rel="noopener noreferrer">SECURITY.md</a>。',
  },

  'csp-governing': {
    ru: 'При расхождениях приоритет имеет турецкий текст настоящей политики.',
    ar: 'في حال وجود اختلاف، يُعتدّ بالنص التركي من هذه السياسة.',
    ja: '相違がある場合は、本ポリシーのトルコ語正文が優先します。',
    ko: '다를 경우 이 정책문의 터키어 본문이 우선합니다.',
    zh: '如有差异，以本政策的土耳其语文本为准。',
  },
};

apply(I18N_DIR, CODES, TRANSLATIONS);
