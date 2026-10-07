/* Adds the code signing policy page's keys to the Latin-script locales.
 *
 *   node scripts/apply-signpath-policy-i18n.cjs
 *
 * Kept in the tree for the reason apply-legal-i18n.cjs is: the failure mode of a
 * half-applied change here is invisible. The page still renders, the key-parity
 * check still passes for the keys that made it, and eleven readers get the
 * Turkish text on a page whose whole purpose is to be read by someone assessing
 * whether this project can be trusted with a certificate.
 *
 * The Cyrillic, Arabic, CJK and Hangul locales live in
 * apply-signpath-policy-i18n-nonlatin.cjs, which requires this one to have run.
 *
 * One string must survive translation verbatim. SignPath Foundation's terms
 * require the project to publish the words "Free code signing provided by
 * SignPath.io, certificate by SignPath Foundation" and their reviewer quotes them
 * back. A translated rendering of a sentence they intend to search for is worse
 * than useless, so SIGNPATH_SENTENCE is assigned unchanged in every locale below
 * rather than translated.
 */
const fs = require('fs');
const path = require('path');

const { apply } = require('./lib/signpath-policy-i18n.cjs');

const I18N_DIR = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');

const CODES = ['de', 'en', 'es', 'fr', 'it', 'pt', 'tr'];

const SIGNPATH_SENTENCE =
  'Free code signing provided by SignPath.io, certificate by SignPath Foundation.';

const TRANSLATIONS = {
  'csp-eyebrow': {
    tr: 'Yasal',
    en: 'Legal',
    de: 'Rechtliches',
    fr: 'Mentions légales',
    es: 'Legal',
    it: 'Note legali',
    pt: 'Legal',
  },

  'csp-title': {
    tr: 'Kod İmza Politikası',
    en: 'Code signing policy',
    de: 'Richtlinie zur Code-Signierung',
    fr: 'Politique de signature de code',
    es: 'Política de firma de código',
    it: 'Informativa sulla firma del codice',
    pt: 'Política de assinatura de código',
  },

  'csp-updated': {
    tr: 'Son güncelleme: Ekim 2026 · 12 dilde sunulur.',
    en: 'Last updated: October 2026 · Available in 12 languages.',
    de: 'Zuletzt aktualisiert: Oktober 2026 · In 12 Sprachen verfügbar.',
    fr: 'Dernière mise à jour : octobre 2026 · Disponible en 12 langues.',
    es: 'Última actualización: octubre de 2026 · Disponible en 12 idiomas.',
    it: 'Ultimo aggiornamento: ottobre 2026 · Disponibile in 12 lingue.',
    pt: 'Última atualização: outubro de 2026 · Disponível em 12 idiomas.',
  },

  'csp-h2-1': {
    tr: '1. Bu politika neyi belirler',
    en: '1. What this policy determines',
    de: '1. Was diese Richtlinie festlegt',
    fr: '1. Ce que cette politique détermine',
    es: '1. Qué determina esta política',
    it: '1. Cosa determina questa informativa',
    pt: '1. O que esta política determina',
  },

  'csp-p1-1': {
    tr: "Bu sayfa, KalderaShield'ın hangi sürüm dosyalarının imzalandığını, kimin tarafından ve hangi anahtar saklama düzeniyle imzalandığını ve her imza için kimin onay vermekten sorumlu olduğunu belirtir. Depodaki aynı belgenin kaynak sürümü: <a href=\"https://github.com/hafgit99/kalderashield/blob/main/CODE_SIGNING_POLICY.md\" rel=\"noopener noreferrer\">CODE_SIGNING_POLICY.md</a>",
    en: 'This page states which KalderaShield release artifacts are signed, by whom, under which key custody arrangement, and who is accountable for approving each signature. The source version of the same document in the repository: <a href="https://github.com/hafgit99/kalderashield/blob/main/CODE_SIGNING_POLICY.md" rel="noopener noreferrer">CODE_SIGNING_POLICY.md</a>',
    de: 'Diese Seite legt fest, welche Release-Artefakte von KalderaShield signiert werden, von wem, unter welcher Schlüsselverwahrung und wer für die Freigabe jeder Signatur verantwortlich ist. Die Quellfassung desselben Dokuments im Repository: <a href="https://github.com/hafgit99/kalderashield/blob/main/CODE_SIGNING_POLICY.md" rel="noopener noreferrer">CODE_SIGNING_POLICY.md</a>',
    fr: "Cette page indique quels artefacts de publication de KalderaShield sont signés, par qui, sous quel mode de conservation des clés et qui est responsable de l'approbation de chaque signature. La version source du même document dans le dépôt : <a href=\"https://github.com/hafgit99/kalderashield/blob/main/CODE_SIGNING_POLICY.md\" rel=\"noopener noreferrer\">CODE_SIGNING_POLICY.md</a>",
    es: 'Esta página indica qué artefactos de publicación de KalderaShield están firmados, por quién, bajo qué custodia de claves y quién responde de aprobar cada firma. La versión fuente del mismo documento en el repositorio: <a href="https://github.com/hafgit99/kalderashield/blob/main/CODE_SIGNING_POLICY.md" rel="noopener noreferrer">CODE_SIGNING_POLICY.md</a>',
    it: "Questa pagina indica quali artefatti di rilascio di KalderaShield sono firmati, da chi, con quale custodia delle chiavi e chi risponde dell'approvazione di ogni firma. La versione sorgente dello stesso documento nel repository: <a href=\"https://github.com/hafgit99/kalderashield/blob/main/CODE_SIGNING_POLICY.md\" rel=\"noopener noreferrer\">CODE_SIGNING_POLICY.md</a>",
    pt: 'Esta página indica quais artefatos de lançamento do KalderaShield são assinados, por quem, sob qual custódia de chaves e quem responde pela aprovação de cada assinatura. A versão-fonte do mesmo documento no repositório: <a href="https://github.com/hafgit99/kalderashield/blob/main/CODE_SIGNING_POLICY.md" rel="noopener noreferrer">CODE_SIGNING_POLICY.md</a>',
  },

  'csp-h2-2': {
    tr: '2. Windows',
    en: '2. Windows',
    de: '2. Windows',
    fr: '2. Windows',
    es: '2. Windows',
    it: '2. Windows',
    pt: '2. Windows',
  },

  /* The required sentence. Identical in every locale -- see the header. */
  'csp-p1-3': {
    tr: SIGNPATH_SENTENCE,
    en: SIGNPATH_SENTENCE,
    de: SIGNPATH_SENTENCE,
    fr: SIGNPATH_SENTENCE,
    es: SIGNPATH_SENTENCE,
    it: SIGNPATH_SENTENCE,
    pt: SIGNPATH_SENTENCE,
  },

  'csp-p1-4': {
    tr: "<strong>Durum: başvuru aşamasında.</strong> KalderaShield, SignPath Foundation programına başvurmuştur ve kararlarını beklemektedir. Bu bölümde hiçbir Windows dosyasının şu anda imzalı olduğu ileri sürülmemelidir — <strong>imzalı değildir.</strong> İlk imzalı sürüm gerçekten yayımlanana kadar doğru ifade yukarıdaki gibidir ve bu bölüm o sürümden <em>önce</em> güncellenir, sonra değil.",
    en: '<strong>Status: application pending.</strong> KalderaShield has applied to the SignPath Foundation and is waiting for their decision. Nothing in this section should be read as a claim that any Windows artifact is currently signed. <strong>It is not signed.</strong> Until the first signed release actually ships, the honest statement is the one above, and this section is updated <em>before</em> that release, not after.',
    de: '<strong>Status: Antrag ausstehend.</strong> KalderaShield hat sich beim SignPath Foundation beworben und wartet auf deren Entscheidung. Aus diesem Abschnitt darf nicht abgeleitet werden, dass ein Windows-Artefakt derzeit signiert sei. <strong>Es ist nicht signiert.</strong> Bis die erste signierte Version tatsächlich ausgeliefert ist, gilt die obenstehende Aussage, und dieser Abschnitt wird <em>vor</em> dieser Version aktualisiert, nicht danach.',
    fr: "<strong>Statut : candidature en cours.</strong> KalderaShield a candidat auprès de la SignPath Foundation et attend sa décision. Rien dans cette section ne doit être lu comme une affirmation selon laquelle un artefact Windows serait actuellement signé. <strong>Il ne l'est pas.</strong> Tant que la première version signée n'a pas été effectivement publiée, la formulation honnête est celle ci-dessus, et cette section sera mise à jour <em>avant</em> cette version, pas après.",
    es: '<strong>Estado: solicitud pendiente.</strong> KalderaShield ha solicitado la SignPath Foundation y está esperando su decisión. Nada en esta sección debe leerse como una afirmación de que algún artefacto de Windows esté firmado actualmente. <strong>No lo está.</strong> Hasta que la primera versión firmada se publique de verdad, la formulación honesta es la de arriba, y esta sección se actualizará <em>antes</em> de esa versión, no después.',
    it: "<strong>Stato: candidatura in corso.</strong> KalderaShield ha presentato domanda alla SignPath Foundation e attende la sua decisione. Nulla in questa sezione va letto come un'affermazione che un artefatto Windows sia attualmente firmato. <strong>Non lo è.</strong> Finché la prima versione firmata non sarà effettivamente pubblicata, la formulazione onesta è quella qui sopra, e questa sezione verrà aggiornata <em>prima</em> di quella versione, non dopo.",
    pt: '<strong>Estado: candidatura pendente.</strong> O KalderaShield candidatou-se à SignPath Foundation e aguarda a sua decisão. Nada nesta secção deve ser lido como uma afirmação de que algum artefacto Windows esteja assinado atualmente. <strong>Não está.</strong> Até que a primeira versão assinada seja efetivamente publicada, a formulação honesta é a acima, e esta secção será atualizada <em>antes</em> dessa versão, não depois.',
  },

  'csp-p1-5': {
    tr: 'İmzalanacak dosyalar NSIS kurucusu (<code>KalderaShield_&lt;surum&gt;_x64-setup.exe</code>), yönetilen dağıtım için MSI paketi (<code>KalderaShield_&lt;surum&gt;_x64.msi</code>) ve kurulum gerektirmeyen taşınabilir çalıştırılabilirdir (<code>KalderaShield_&lt;surum&gt;_x64-portable.exe</code>). Üçü de bu depodan derlenir ve <a href="https://github.com/hafgit99/kalderashield/releases" rel="noopener noreferrer">sürümler sayfasında</a> yayımlanır. Bu depodan derlenmeyen hiçbir dosya bu projenin sertifikasıyla imzalanmaz ve üçüncü taraftan hiçbir ikili, bu sertifika altında yeniden imzalanmaz.',
    en: 'The files to be signed are the NSIS installer (<code>KalderaShield_&lt;version&gt;_x64-setup.exe</code>), the MSI package for managed deployment (<code>KalderaShield_&lt;version&gt;_x64.msi</code>) and the portable executable that needs no installation (<code>KalderaShield_&lt;version&gt;_x64-portable.exe</code>). All three are built from this repository and published on the <a href="https://github.com/hafgit99/kalderashield/releases" rel="noopener noreferrer">releases page</a>. No artifact not built from this repository is signed with this project\'s certificate, and no third-party binary is re-signed under it.',
    de: 'Signiert werden das NSIS-Installationsprogramm (<code>KalderaShield_&lt;version&gt;_x64-setup.exe</code>), das MSI-Paket für verwaltete Bereitstellung (<code>KalderaShield_&lt;version&gt;_x64.msi</code>) und die portable Programmdatei ohne Installation (<code>KalderaShield_&lt;version&gt;_x64-portable.exe</code>). Alle drei werden aus diesem Repository gebaut und auf der <a href="https://github.com/hafgit99/kalderashield/releases" rel="noopener noreferrer">Release-Seite</a> veröffentlicht. Kein Artefakt, das nicht aus diesem Repository gebaut wurde, wird mit dem Zertifikat dieses Projekts signiert, und keine Binärdatei Dritter wird darunter neu signiert.',
    fr: "Les fichiers à signer sont l'installeur NSIS (<code>KalderaShield_&lt;version&gt;_x64-setup.exe</code>), le paquet MSI pour déploiement géré (<code>KalderaShield_&lt;version&gt;_x64.msi</code>) et l'exécutable portable qui ne nécessite aucune installation (<code>KalderaShield_&lt;version&gt;_x64-portable.exe</code>). Les trois sont construits depuis ce dépôt et publiés sur la <a href=\"https://github.com/hafgit99/kalderashield/releases\" rel=\"noopener noreferrer\">page des versions</a>. Aucun artefact qui n'est pas construit depuis ce dépôt n'est signé avec le certificat de ce projet, et aucun binaire tiers n'est resigné avec lui.",
    es: 'Los archivos que se firmarán son el instalador NSIS (<code>KalderaShield_&lt;version&gt;_x64-setup.exe</code>), el paquete MSI para despliegue gestionado (<code>KalderaShield_&lt;version&gt;_x64.msi</code>) y el ejecutable portátil que no necesita instalación (<code>KalderaShield_&lt;version&gt;_x64-portable.exe</code>). Los tres se construyen desde este repositorio y se publican en la <a href="https://github.com/hafgit99/kalderashield/releases" rel="noopener noreferrer">página de versiones</a>. Ningún artefacto que no se construya desde este repositorio se firma con el certificado de este proyecto, y ningún binario de terceros se vuelve a firmar con él.',
    it: "I file da firmare sono il programma di installazione NSIS (<code>KalderaShield_&lt;version&gt;_x64-setup.exe</code>), il pacchetto MSI per la distribuzione gestita (<code>KalderaShield_&lt;version&gt;_x64.msi</code>) e l'eseguibile portatile che non richiede installazione (<code>KalderaShield_&lt;version&gt;_x64-portable.exe</code>). Tutti e tre sono compilati da questo repository e pubblicati nella <a href=\"https://github.com/hafgit99/kalderashield/releases\" rel=\"noopener noreferrer\">pagina delle release</a>. Nessun artefatto non compilato da questo repository viene firmato con il certificato di questo progetto, e nessun binario di terze parti viene rifirmato con esso.",
    pt: 'Os ficheiros a assinar são o instalador NSIS (<code>KalderaShield_&lt;version&gt;_x64-setup.exe</code>), o pacote MSI para implementação gerida (<code>KalderaShield_&lt;version&gt;_x64.msi</code>) e o executável portátil que não exige instalação (<code>KalderaShield_&lt;version&gt;_x64-portable.exe</code>). Os três são compilados a partir deste repositório e publicados na <a href="https://github.com/hafgit99/kalderashield/releases" rel="noopener noreferrer">página de lançamentos</a>. Nenhum artefacto que não seja compilado a partir deste repositório é assinado com o certificado deste projeto, e nenhum binário de terceiros é reassinado com ele.',
  },

  'csp-p1-6': {
    tr: "<strong>Anahtar saklama:</strong> özel anahtar SignPath'ın HSM'sinde üretilir ve saklanır. Bu proje anahtarı hiçbir zaman elinde tutmaz, dışa aktarmaz ve ne bir derleme çalıştırıcısına ne de bir geliştirici makinesine iletmez. İmza, deponun CI'ının gönderdiği ve bir insanın onayladığı bir imza talebi karşılığında SignPath tarafında gerçekleşir.",
    en: "<strong>Key custody:</strong> the private key is generated and stored on SignPath's HSM. This project never holds it, never exports it, and never transmits it to a build runner or a developer machine. Signing happens on SignPath's side, in response to a signature request that this repository's CI submits and a human approves.",
    de: "<strong>Schlüsselverwahrung:</strong> der private Schlüssel wird auf der HSM von SignPath erzeugt und gespeichert. Dieses Projekt hält ihn nie, exportiert ihn nie und übermittelt ihn weder an einen Build-Runner noch an einen Entwicklerrechner. Die Signierung erfolgt auf Seite von SignPath, als Antwort auf eine Signaturanforderung, die die CI dieses Repositorys einreicht und ein Mensch genehmigt.",
    fr: "<strong>Conservation des clés :</strong> la clé privée est générée et conservée dans le HSM de SignPath. Ce projet ne la détient jamais, ne l'exporte jamais et ne la transmet jamais à un agent de build ni à une machine de développeur. La signature a lieu du côté de SignPath, en réponse à une demande de signature soumise par la CI de ce dépôt et approuvée par une personne.",
    es: "<strong>Custodia de claves:</strong> la clave privada se genera y almacena en el HSM de SignPath. Este proyecto nunca la posee, nunca la exporta y nunca la transmite a un agente de compilación ni a una máquina de desarrollador. La firma ocurre en el lado de SignPath, en respuesta a una solicitud de firma que la CI de este repositorio envía y una persona aprueba.",
    it: "<strong>Custodia delle chiavi:</strong> la chiave privata viene generata e conservata nell'HSM di SignPath. Questo progetto non la detiene mai, non la esporta mai e non la trasmette mai a un runner di build né a una macchina di sviluppo. La firma avviene sul lato di SignPath, in risposta a una richiesta di firma che la CI di questo repository inoltra e che una persona approva.",
    pt: '<strong>Custódia das chaves:</strong> a chave privada é gerada e guardada no HSM da SignPath. Este projeto nunca a possui, nunca a exporta e nunca a transmite a um agente de compilação nem a uma máquina de programador. A assinatura ocorre do lado da SignPath, em resposta a um pedido de assinatura que a CI deste repositório submete e que uma pessoa aprova.',
  },

  'csp-p1-7': {
    tr: "<strong>Zincir:</strong> sürüm etiketi gönderilir → GitHub Actions dosyaları derler (iş akışları herkese açık, üçüncü taraf eylemleri commit SHA'sıyla sabitli, jeton izinleri salt okunur) → derleme dosyaları SignPath'a yükler ve bir imza talebi açar, imzalamaz → bir Onaylayıcı onaylar veya reddeder → SignPath Foundation sertifikasıyla imzalar → imzalı dosya <code>SHA256SUMS.txt</code> ile birlikte yayımlanır. Her sürüm için elle onay gerekir; gözetimsiz bir imza yolu yoktur ve eklenmeyecektir.",
    en: "<strong>Chain:</strong> a version tag is pushed → GitHub Actions builds the files (workflows are public, third-party actions are pinned by commit SHA, token permissions are read-only) → the build uploads them to SignPath and raises a signature request without signing → an Approver approves or rejects → SignPath signs with the Foundation certificate → the signed file is published together with <code>SHA256SUMS.txt</code>. Every release requires manual approval; there is no unattended signing path and none will be added.",
    de: "<strong>Kette:</strong> ein Version-Tag wird gepusht → GitHub Actions baut die Dateien (Workflows sind öffentlich, Aktionen Dritter sind per Commit-SHA gepinnt, Token-Berechtigungen sind lesend) → der Build lädt sie zu SignPath hoch und stellt eine Signaturanforderung, ohne zu signieren → ein Freigeber genehmigt oder lehnt ab → SignPath signiert mit dem Foundation-Zertifikat → die signierte Datei wird zusammen mit <code>SHA256SUMS.txt</code> veröffentlicht. Jedes Release erfordert eine manuelle Freigabe; es gibt keinen unbeaufsichtigten Signaturpfad und es wird keinen geben.",
    fr: "<strong>Chaîne :</strong> une étiquette de version est poussée → GitHub Actions construit les fichiers (workflows publics, actions tierces épinglées par SHA de commit, permissions de jeton en lecture seule) → le build les envoie à SignPath et ouvre une demande de signature sans signer → un approbateur approuve ou refuse → SignPath signe avec le certificat de la Foundation → le fichier signé est publié avec <code>SHA256SUMS.txt</code>. Chaque version exige une approbation manuelle ; il n'existe aucun chemin de signature non supervisé et il n'en sera pas ajouté.",
    es: '<strong>Cadena:</strong> se envía una etiqueta de versión → GitHub Actions compila los archivos (flujos de trabajo públicos, acciones de terceros fijadas por SHA de commit, permisos de token de solo lectura) → la compilación los sube a SignPath y abre una solicitud de firma sin firmar → un aprobador aprueba o rechaza → SignPath firma con el certificado de la Foundation → el archivo firmado se publica junto con <code>SHA256SUMS.txt</code>. Cada versión requiere aprobación manual; no existe ninguna ruta de firma desatendida y no se añadirá ninguna.',
    it: "<strong>Catena:</strong> viene pushato un tag di versione → GitHub Actions compila i file (workflow pubblici, azioni di terze parti bloccate per SHA di commit, autorizzazioni dei token di sola lettura) → la build li carica su SignPath e apre una richiesta di firma senza firmare → un approvatore approva o rifiuta → SignPath firma con il certificato della Foundation → il file firmato viene pubblicato insieme a <code>SHA256SUMS.txt</code>. Ogni release richiede un'approvazione manuale; non esiste un percorso di firma non presidiato e non verrà aggiunto.",
    pt: '<strong>Cadeia:</strong> é criada uma tag de versão → o GitHub Actions compila os ficheiros (fluxos de trabalho públicos, ações de terceiros fixadas por SHA de commit, permissões dos tokens apenas de leitura) → a compilação envia-os para a SignPath e abre um pedido de assinatura sem assinar → um aprovador aprova ou rejeita → a SignPath assina com o certificado da Foundation → o ficheiro assinado é publicado juntamente com <code>SHA256SUMS.txt</code>. Cada lançamento exige aprovação manual; não existe um caminho de assinatura não assistido e nenhum será acrescentado.',
  },

  'csp-p1-8': {
    tr: 'Geçerli bir SignPath Foundation imzası, ikili dosyanın sürümün belirttiği depodaki kaynak koddan doğrulanabilir ve otomatik bir derleme olduğu anlamına gelir. Yazılımın denetlendiği anlamına <strong>gelmez</strong> ve uygulamaya ilişkin bir güvenlik onayı değildir. Bu proje tehdit modeli ve kalite kapısı belgeleri yayımlar, ancak tamamlanmış bağımsız bir üçüncü taraf güvenlik denetimi yoktur: <a href="/guvenlik/denetim-durumu/">Güvenlik Denetimi Durumu</a>.',
    en: 'A valid SignPath Foundation signature means the binary is a verifiable, automated build of the source code in this repository at the commit the release names. It does <strong>not</strong> mean the software has been audited, and it is not a security endorsement of the application. This project publishes a threat model and quality-gate documentation, but has no completed independent third-party security audit: <a href="/guvenlik/denetim-durumu/">Security audit status</a>.',
    de: 'Eine gültige SignPath-Foundation-Signatur bedeutet, dass die Binärdatei ein überprüfbarer, automatisierter Build des Quellcodes in diesem Repository zum vom Release genannten Commit ist. Sie bedeutet <strong>nicht</strong>, dass die Software auditiert wurde, und ist keine Sicherheitsempfehlung für die Anwendung. Dieses Projekt veröffentlicht ein Bedrohungsmodell und Qualitätssicherungs-Dokumentation, hat aber kein abgeschlossenes unabhängiges Sicherheitsaudit durch Dritte: <a href="/guvenlik/denetim-durumu/">Status des Sicherheitsaudits</a>.',
    fr: "Une signature SignPath Foundation valide signifie que le binaire est un build automatisable et vérifiable du code source de ce dépôt au commit indiqué par la version. Cela ne signifie <strong>pas</strong> que le logiciel a été audité, et ce n'est pas une approbation de sécurité de l'application. Ce projet publie un modèle de menace et une documentation de qualité, mais ne dispose d'aucun audit de sécurité indépendant réalisé par un tiers : <a href=\"/guvenlik/denetim-durumu/\">statut de l'audit de sécurité</a>.",
    es: 'Una firma válida de SignPath Foundation significa que el binario es una compilación automatizada y verificable del código fuente de este repositorio en el commit que indica la release. <strong>No</strong> significa que el software haya sido auditado, y no es una aprobación de seguridad de la aplicación. Este proyecto publica un modelo de amenazas y documentación de puertas de calidad, pero no cuenta con una auditoría de seguridad independiente completada: <a href="/guvenlik/denetim-durumu/">estado de la auditoría de seguridad</a>.',
    it: 'Una firma SignPath Foundation valida significa che il binario è una build automatica e verificabile del codice sorgente di questo repository al commit indicato dalla release. <strong>Non</strong> significa che il software sia stato sottoposto ad audit, e non è un\'approvazione di sicurezza per l\'applicazione. Questo progetto pubblica un modello di minaccia e documentazione sui controlli di qualità, ma non dispone di un audit di sicurezza indipendente completato: <a href="/guvenlik/denetim-durumu/">stato dell\'audit di sicurezza</a>.',
    pt: 'Uma assinatura válida da SignPath Foundation significa que o binário é uma compilação automatizada e verificável do código-fonte deste repositório no commit indicado pelo lançamento. <strong>Não</strong> significa que o software tenha sido auditado, e não é uma aprovação de segurança da aplicação. Este projeto publica um modelo de ameaças e documentação de portões de qualidade, mas não tem uma auditoria de segurança independente concluída: <a href="/guvenlik/denetim-durumu/">estado da auditoria de segurança</a>.',
  },

  'csp-h2-3': {
    tr: '3. Ekip rolleri',
    en: '3. Team roles',
    de: '3. Rollen im Team',
    fr: "3. Rôles dans l'équipe",
    es: '3. Roles del equipo',
    it: '3. Ruoli nel team',
    pt: '3. Funções da equipa',
  },

  'csp-p1-9': {
    tr: "KalderaShield tek kişi tarafından sürdürülmektedir. Bunu bir ekip gibi sunmak yerine burada açıkça belirtiyoruz, çünkü aşağıdaki roller SignPath'ın istediği rollerdir ve tek bir bakımcı yalnız ve dürüstçe doldurabilir. Bu depoya yazma erişimi olan tüm hesaplar çok faktörlü kimlik doğrulama kullanır.",
    en: "KalderaShield is maintained by a single person. That is stated here rather than presented as a team, because the roles below are the ones SignPath requires and a single maintainer can only honestly fill them alone. All accounts with write access to this repository use multi-factor authentication.",
    de: 'KalderaShield wird von einer einzigen Person gepflegt. Das wird hier festgestellt, statt als Team dargestellt zu werden, weil die Rollen unten diejenigen sind, die SignPath verlangt und eine einzelne pflegende Person sie nur ehrlicherweise allein ausfüllen kann. Alle Konten mit Schreibzugriff auf dieses Repository verwenden Multi-Faktor-Authentifizierung.',
    fr: "KalderaShield est maintenu par une seule personne. Cela est indiqué ici plutôt que présenté comme une équipe, car les rôles ci-dessous sont ceux exigés par SignPath et une personne seule ne peut honnêtement les occuper qu'elle-même. Tous les comptes disposant d'un accès en écriture à ce dépôt utilisent l'authentification multifacteur.",
    es: 'KalderaShield lo mantiene una sola persona. Se hace constar aquí en lugar de presentarlo como un equipo, porque los roles siguientes son los que exige SignPath y una única persona mantenedora solo puede ocuparlos honestamente en solitario. Todas las cuentas con acceso de escritura a este repositorio usan autenticación multifactor.',
    it: 'KalderaShield è mantenuto da una sola persona. Qui viene dichiarato anziché presentato come un team, perché i ruoli qui sotto sono quelli richiesti da SignPath e un singolo mantenitore può onestamente occuparli da solo. Tutti gli account con accesso in scrittura a questo repository usano l\'autenticazione a più fattori.',
    pt: 'O KalderaShield é mantido por uma só pessoa. Isto é declarado aqui em vez de ser apresentado como uma equipa, porque as funções abaixo são as que a SignPath exige e um único mantenedor só pode preenchê-las honestamente sozinho. Todas as contas com acesso de escrita a este repositório usam autenticação multifator.',
  },

  'csp-p1-11': {
    tr: '<p><strong>Yazarlar (Authors)</strong> — ek bir inceleme olmadan kaynak kodu değiştirebilen kişiler:</p>\n      <ul>\n        <li><code>hafgit99</code> — <a href="https://github.com/hafgit99" rel="noopener noreferrer">github.com/hafgit99</a></li>\n      </ul>\n      <p>Yazma yetkisi olan tek hesap budur. Depo bir kuruluş değil, kişisel bir hesap altındadır; bu yüzden yazma yolu, üzerinde MFA bulunan tek bir kimliktir.</p>',
    en: '<p><strong>Authors</strong> — people who may modify the source code without additional review:</p>\n      <ul>\n        <li><code>hafgit99</code> — <a href="https://github.com/hafgit99" rel="noopener noreferrer">github.com/hafgit99</a></li>\n      </ul>\n      <p>This is the only account with write access. The repository is owned by a personal account rather than an organisation, so the write path is a single identity with MFA on it.</p>',
    de: '<p><strong>Autoren</strong> — Personen, die den Quellcode ohne zusätzliche Prüfung ändern dürfen:</p>\n      <ul>\n        <li><code>hafgit99</code> — <a href="https://github.com/hafgit99" rel="noopener noreferrer">github.com/hafgit99</a></li>\n      </ul>\n      <p>Dies ist das einzige Konto mit Schreibzugriff. Das Repository gehört einem persönlichen Konto und nicht einer Organisation, der Schreibpfad ist also eine einzelne Identität mit MFA darauf.</p>',
    fr: "<p><strong>Auteurs</strong> — personnes pouvant modifier le code source sans revue supplémentaire :</p>\n      <ul>\n        <li><code>hafgit99</code> — <a href=\"https://github.com/hafgit99\" rel=\"noopener noreferrer\">github.com/hafgit99</a></li>\n      </ul>\n      <p>C'est le seul compte disposant d'un accès en écriture. Le dépôt appartient à un compte personnel et non à une organisation : le chemin d'écriture est donc une identité unique assortie de l'authentification multifacteur.</p>",
    es: '<p><strong>Autores</strong> — personas que pueden modificar el código fuente sin revisión adicional:</p>\n      <ul>\n        <li><code>hafgit99</code> — <a href="https://github.com/hafgit99" rel="noopener noreferrer">github.com/hafgit99</a></li>\n      </ul>\n      <p>Esta es la única cuenta con acceso de escritura. El repositorio pertenece a una cuenta personal y no a una organización, de modo que la vía de escritura es una única identidad con MFA activado.</p>',
    it: '<p><strong>Autori</strong> — persone che possono modificare il codice sorgente senza ulteriore revisione:</p>\n      <ul>\n        <li><code>hafgit99</code> — <a href="https://github.com/hafgit99" rel="noopener noreferrer">github.com/hafgit99</a></li>\n      </ul>\n      <p>Questo è l\'unico account con accesso in scrittura. Il repository appartiene a un account personale e non a un\'organizzazione, quindi il percorso di scrittura è un\'identità singola con MFA attivo.</p>',
    pt: '<p><strong>Autores</strong> — pessoas que podem modificar o código-fonte sem revisão adicional:</p>\n      <ul>\n        <li><code>hafgit99</code> — <a href="https://github.com/hafgit99" rel="noopener noreferrer">github.com/hafgit99</a></li>\n      </ul>\n      <p>Esta é a única conta com acesso de escrita. O repositório pertence a uma conta pessoal e não a uma organização, pelo que o caminho de escrita é uma única identidade com MFA.</p>',
  },

  'csp-p1-13': {
    tr: '<p><strong>İnceleyenler (Reviewers)</strong> — commit yetkilisi olmayan biri tarafından önerilen her değişikliği birleştirilmeden önce inceleyen kişiler:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p>Şu anda commit yetkilisi olmayan katkıcı bulunmadığından bu rol pratikte yalnızca ince değil, fiilen boştur.</p>',
    en: '<p><strong>Reviewers</strong> — people who review every change proposed by a non-committer before it is merged:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p>There are no non-committer contributors at present, so this role is currently vacant in practice rather than merely thin.</p>',
    de: '<p><strong>Prüfer</strong> — Personen, die jede von einer Person ohne Commit-Recht vorgeschlagene Änderung vor dem Zusammenführen prüfen:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p>Derzeit gibt es keine Beitragenden ohne Commit-Recht, diese Rolle ist also praktisch nicht nur dünn, sondern leer.</p>',
    fr: "<p><strong>Relecteurs</strong> — personnes qui examinent chaque modification proposée par quelqu'un sans droit de commit avant sa fusion :</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p>Il n'y a actuellement aucun contributeur sans droit de commit ; ce rôle est donc, en pratique, non pas seulement mince mais vacant.</p>",
    es: '<p><strong>Revisores</strong> — personas que revisan cada cambio propuesto por alguien sin permiso de commit antes de fusionarlo:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p>Hoy no hay personas que colaboren sin permiso de commit, de modo que este rol está, en la práctica, no solo poco activo sino vacante.</p>',
    it: "<p><strong>Revisori</strong> — persone che esaminano ogni modifica proposta da qualcuno senza permesso di commit prima del merge:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p>Al momento non ci sono contributori senza permesso di commit, quindi questo ruolo è in pratica non solo scarso ma vacante.</p>",
    pt: '<p><strong>Revisores</strong> — pessoas que revem cada alteração proposta por alguém sem permissão de commit antes da integração:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p>Atualmente não há colaboradores sem permissão de commit, pelo que esta função está, na prática, não apenas fraca mas vaga.</p>',
  },

  'csp-p1-15': {
    tr: '<p><strong>Onaylayıcılar (Approvers)</strong> — dosya imzalanmadan önce her imza talebini onaylayan kişiler:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p><strong>Bilinen eksik:</strong> üç rolü de tek kişi taşıdığı için, kodu yazan kişi kendi imzasını da onaylamış oluyor. SignPath\'ın modeli, Onaylayıcının «tüm ekip tarafından güvenilen» biri olmasını varsayar ve bu, birden fazla ekip üyesi varsayar. İkinci bir Onaylayıcı eklemek planlanmıştır ve henüz yapılmamıştır. Bunu gerekçe sayan bir inceleyici, onaydan sonra değil, şimdi söylemelidir.</p>',
    en: '<p><strong>Approvers</strong> — people who approve each signature request before the artifact is signed:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p><strong>Known gap:</strong> with one person holding all three roles, the person who writes the code also approves its signature. SignPath\'s model assumes an Approver is "trusted by the entire team", which presumes more than one team member. Adding a second Approver is planned and not yet done. A reviewer who considers this disqualifying should say so now rather than after approval.</p>',
    de: '<p><strong>Freigeber</strong> — Personen, die jede Signaturanforderung genehmigen, bevor das Artefakt signiert wird:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p><strong>Bekannte Lücke:</strong> Da eine Person alle drei Rollen innehat, genehmigt die Person, die den Code schreibt, auch die Signatur. Das Modell von SignPath setzt voraus, dass ein Freigeber "vom gesamten Team vertraut" ist, was mehr als ein Teammitglied voraussetzt. Ein zweiter Freigeber ist geplant und noch nicht eingerichtet. Wer dies für einen Ausschlussgrund hält, sollte es jetzt sagen und nicht erst nach der Freigabe.</p>',
    fr: '<p><strong>Approbateurs</strong> — personnes qui approuvent chaque demande de signature avant que l\'artefact ne soit signé :</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p><strong>Faiblesse connue :</strong> une seule personne détenant les trois rôles, la personne qui écrit le code approuve aussi sa signature. Le modèle de SignPath suppose qu\'un approbateur est « digne de confiance pour toute l\'équipe », ce qui présuppose plus d\'un membre d\'équipe. L\'ajout d\'un second approbateur est prévu mais pas encore fait. Qui considère cela comme un motif d\'exclusion devrait le dire maintenant plutôt qu\'après l\'approbation.</p>',
    es: '<p><strong>Aprobadores</strong> — personas que aprueban cada solicitud de firma antes de que el artefacto sea firmado:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p><strong>Debilidad conocida:</strong> con una sola persona en los tres roles, quien escribe el código también aprueba su firma. El modelo de SignPath supone que un aprobador es "de confianza para todo el equipo", lo que presume más de un miembro. Añadir un segundo aprobador está previsto y aún no se ha hecho. Quien considere esto descalificador debería decirlo ahora y no después de la aprobación.</p>',
    it: '<p><strong>Approvatori</strong> — persone che approvano ogni richiesta di firma prima che l\'artefatto venga firmato:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p><strong>Limite noto:</strong> con una sola persona in tutti e tre i ruoli, chi scrive il codice approva anche la propria firma. Il modello di SignPath presuppone che un approvatore sia "di fiducia per l\'intero team", il che dà per scontato più di un membro. L\'aggiunta di un secondo approvatore è prevista ma non ancora fatta. Chi ritenga questo disqualificante dovrebbe dirlo ora e non dopo l\'approvazione.</p>',
    pt: '<p><strong>Aprovadores</strong> — pessoas que aprovam cada pedido de assinatura antes de o artefacto ser assinado:</p>\n      <ul>\n        <li><code>hafgit99</code></li>\n      </ul>\n      <p><strong>Limitação conhecida:</strong> com uma única pessoa nas três funções, quem escreve o código também aprova a sua assinatura. O modelo da SignPath pressupõe que um aprovador é "de confiança para toda a equipa", o que pressupõe mais de um membro. Acrescentar um segundo aprovador está previsto mas ainda não foi feito. Quem considere isto desqualificador deve dizê-lo agora e não depois da aprovação.</p>',
  },

  'csp-h2-4': {
    tr: '4. Gizlilik politikası',
    en: '4. Privacy policy',
    de: '4. Datenschutzrichtlinie',
    fr: '4. Politique de confidentialité',
    es: '4. Política de privacidad',
    it: '4. Informativa sulla privacy',
    pt: '4. Política de privacidade',
  },

  'csp-p1-18': {
    tr: "<strong>SignPath'ın istediği ifadeyle: bu program, kullanıcı veya programı kuran ya da çalıştıran kişi özellikle istemedikçe başka ağ bağlantılı sistemlere hiçbir bilgi aktarmaz.</strong>",
    en: '<strong>In the terms SignPath asks for: this program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.</strong>',
    de: '<strong>In den Worten, die SignPath verlangt: Dieses Programm übermittelt keine Informationen an andere vernetzte Systeme, sofern dies nicht vom Benutzer oder von der Person, die es installiert oder betreibt, ausdrücklich verlangt wird.</strong>',
    fr: "<strong>Dans les termes demandés par SignPath : ce programme ne transfère aucune information vers d'autres systèmes connectés à moins que l'utilisateur ou la personne qui l'installe ou l'exploite ne le demande expressément.</strong>",
    es: '<strong>En los términos que pide SignPath: este programa no transfiere información a otros sistemas en red a menos que la persona usuaria o quien lo instala o lo utiliza lo solicite expresamente.</strong>',
    it: "<strong>Nelle parole richieste da SignPath: questo programma non trasferisce alcuna informazione ad altri sistemi collegati in rete, a meno che non sia l'utente o la persona che lo installa o lo usa a richiederlo espressamente.</strong>",
    pt: '<strong>Nos termos pedidos pela SignPath: este programa não transfere qualquer informação para outros sistemas ligados em rede, a menos que tal seja expressamente solicitado pelo utilizador ou pela pessoa que o instala ou o utiliza.</strong>',
  },

  'csp-p1-19': {
    tr: 'KalderaShield çevrimdışı öncelikli, sıfır bilgili bir şifre yöneticisidir. Kasa içerikleri cihazda, ana paroladan türetilen anahtarlarla şifrelenir ve hiçbir zaman iletilmez. Hesap yoktur, eşitleme hizmeti yoktur, telemetri yoktur, analitik yoktur. Windows ikili dosyaları, işletim sisteminin kendi bileşenleri dışında hiçbir ağ istemcisi içermez. Ayrıntılı metin: <a href="/privacy.html">Gizlilik Politikası</a>. Kullanıcıları etkileyen üçüncü taraf bileşenlerin davranışı <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE-3RD-PARTY.md" rel="noopener noreferrer">LICENSE-3RD-PARTY.md</a> ile kapsanır.',
    en: 'KalderaShield is an offline-first, zero-knowledge password manager. Vault contents are encrypted on the device with keys derived from the master password and are never transmitted. There is no account, no sync service, no telemetry and no analytics. The Windows binaries contain no network client of any kind beyond the operating system\'s own components. Full text: <a href="/privacy.html">Privacy policy</a>. The behaviour of third-party components that affects users is covered by <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE-3RD-PARTY.md" rel="noopener noreferrer">LICENSE-3RD-PARTY.md</a>.',
    de: 'KalderaShield ist ein Offline-First-Passwortmanager nach dem Prinzip des Nullwissens. Tresorinhalte werden auf dem Gerät mit aus dem Master-Passwort abgeleiteten Schlüsseln verschlüsselt und niemals übermittelt. Es gibt kein Konto, keinen Synchronisationsdienst, keine Telemetrie und keine Analyse. Die Windows-Binärdateien enthalten über die Komponenten des Betriebssystems hinaus keinerlei Netzwerk-Client. Vollständiger Text: <a href="/privacy.html">Datenschutzrichtlinie</a>. Das Verhalten Dritter, das Nutzer betrifft, ist in <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE-3RD-PARTY.md" rel="noopener noreferrer">LICENSE-3RD-PARTY.md</a> geregelt.',
    fr: "KalderaShield est un gestionnaire de mots de passe hors ligne et à connaissance nulle. Le contenu du coffre est chiffré sur l'appareil avec des clés dérivées du mot de passe principal et n'est jamais transmis. Il n'y a ni compte, ni service de synchronisation, ni télémétrie, ni analyse. Les binaires Windows ne contiennent aucun client réseau, hormis les composants du système d'exploitation lui-même. Texte complet : <a href=\"/privacy.html\">Politique de confidentialité</a>. Le comportement des composants tiers qui affecte les utilisateurs est couvert par <a href=\"https://github.com/hafgit99/kalderashield/blob/main/LICENSE-3RD-PARTY.md\" rel=\"noopener noreferrer\">LICENSE-3RD-PARTY.md</a>.",
    es: 'KalderaShield es un gestor de contraseñas sin conexión y de conocimiento cero. El contenido de la bóveda se cifra en el dispositivo con claves derivadas de la contraseña maestra y nunca se transmite. No hay cuenta, ni servicio de sincronización, ni telemetría, ni analítica. Los binarios de Windows no contienen ningún cliente de red de ningún tipo salvo los componentes propios del sistema operativo. Texto completo: <a href="/privacy.html">Política de privacidad</a>. El comportamiento de componentes de terceros que afecta a los usuarios está cubierto por <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE-3RD-PARTY.md" rel="noopener noreferrer">LICENSE-3RD-PARTY.md</a>.',
    it: "KalderaShield è un gestore di password offline-first a conoscenza zero. I contenuti della cassaforte sono cifrati sul dispositivo con chiavi derivate dalla password principale e non vengono mai trasmessi. Non c'è alcun account, alcun servizio di sincronizzazione, alcuna telemetria e alcuna analisi. I binari Windows non contengono alcun client di rete oltre ai componenti del sistema operativo stesso. Testo completo: <a href=\"/privacy.html\">Informativa sulla privacy</a>. Il comportamento dei componenti di terze parti che incid sugli utenti è coperto da <a href=\"https://github.com/hafgit99/kalderashield/blob/main/LICENSE-3RD-PARTY.md\" rel=\"noopener noreferrer\">LICENSE-3RD-PARTY.md</a>.",
    pt: 'O KalderaShield é um gestor de senhas offline-first e de conhecimento zero. O conteúdo do cofre é cifrado no dispositivo com chaves derivadas da senha mestra e nunca é transmitido. Não há conta, serviço de sincronização, telemetria nem análise. Os binários Windows não contêm qualquer cliente de rede para além dos próprios componentes do sistema operativo. Texto completo: <a href="/privacy.html">Política de privacidade</a>. O comportamento de componentes de terceiros que afeta os utilizadores está coberto por <a href="https://github.com/hafgit99/kalderashield/blob/main/LICENSE-3RD-PARTY.md" rel="noopener noreferrer">LICENSE-3RD-PARTY.md</a>.',
  },

  'csp-h2-5': {
    tr: '5. Diğer platformlar',
    en: '5. Other platforms',
    de: '5. Andere Plattformen',
    fr: '5. Autres plateformes',
    es: '5. Otras plataformas',
    it: '5. Altre piattaforme',
    pt: '5. Outras plataformas',
  },

  'csp-p1-21': {
    tr: '<strong>macOS</strong> — dosyalar Apple Developer ID ile imzalanır ve Apple tarafından notarize edilir. Sertifika henüz alınmadığı için hiçbir macOS dosyası imzalanmamıştır ve hiçbiri yayımlanmamıştır. <strong>Linux</strong> — <code>.deb</code>, <code>.rpm</code> ve <code>.AppImage</code> ayrık GPG imzalarıyla (<code>.sig</code>), SBOM\'lar ve tarayıcı eklentisi paketleri anahtarsız Sigstore imzalarıyla (<code>.sigstore.json</code>) yayımlanır. <strong>Android</strong> — sürüm APK\'ları GitHub Actions sırlarında tutulan bir sürüm anahtar kasasıyla imzalanır; Android imzası, Authenticode\'dan ayrıdır. Hiçbir platform, gerçekten imzalı olana kadar imzalı olarak tanımlanmaz.',
    en: '<strong>macOS</strong> — artifacts are signed with an Apple Developer ID and notarized by Apple. The certificate has not been issued yet, so no macOS artifact has been signed and none is published. <strong>Linux</strong> — <code>.deb</code>, <code>.rpm</code> and <code>.AppImage</code> are published with detached GPG signatures (<code>.sig</code>); SBOMs and browser-extension packages with keyless Sigstore signatures (<code>.sigstore.json</code>). <strong>Android</strong> — release APKs are signed with a release keystore held in GitHub Actions secrets; Android signing is separate from Authenticode. No platform is described as signed until it is.',
    de: '<strong>macOS</strong> — Artefakte werden mit einer Apple Developer ID signiert und von Apple notarisiert. Das Zertifikat wurde noch nicht ausgestellt, daher ist kein macOS-Artefakt signiert und keines veröffentlicht. <strong>Linux</strong> — <code>.deb</code>, <code>.rpm</code> und <code>.AppImage</code> werden mit abgetrennten GPG-Signaturen (<code>.sig</code>) veröffentlicht, SBOMs und Browser-Erweiterungspakete mit schlüssellosen Sigstore-Signaturen (<code>.sigstore.json</code>). <strong>Android</strong> — Release-APKs werden mit einem Release-Keystore aus GitHub-Actions-Secrets signiert; die Android-Signatur ist von Authenticode getrennt. Keine Plattform wird als signiert bezeichnet, bevor sie es ist.',
    fr: "<strong>macOS</strong> — les artefacts sont signés avec un Apple Developer ID et notariés par Apple. Le certificat n'a pas encore été délivré, aucun artefact macOS n'est donc signé et aucun n'est publié. <strong>Linux</strong> — <code>.deb</code>, <code>.rpm</code> et <code>.AppImage</code> sont publiés avec des signatures GPG détachées (<code>.sig</code>) ; SBOM et paquets d'extensions de navigateur avec des signatures Sigstore sans clé (<code>.sigstore.json</code>). <strong>Android</strong> — les APK de version sont signés avec un keystore de release conservé dans les secrets GitHub Actions ; la signature Android est distincte d'Authenticode. Aucune plateforme n'est décrite comme signée tant qu'elle ne l'est pas.",
    es: '<strong>macOS</strong> — los artefactos se firman con un Apple Developer ID y Apple los notariza. El certificado aún no se ha emitido, de modo que ningún artefacto de macOS está firmado ni se publica ninguno. <strong>Linux</strong> — <code>.deb</code>, <code>.rpm</code> y <code>.AppImage</code> se publican con firmas GPG desligadas (<code>.sig</code>); los SBOM y los paquetes de extensiones del navegador con firmas Sigstore sin clave (<code>.sigstore.json</code>). <strong>Android</strong> — los APK de publicación se firman con un keystore de publicación guardado en los secretos de GitHub Actions; la firma de Android es independiente de Authenticode. Ninguna plataforma se describe como firmada hasta que lo está.',
    it: '<strong>macOS</strong> — gli artefatti sono firmati con un Apple Developer ID e notarizzati da Apple. Il certificato non è ancora stato emesso, quindi nessun artefatto macOS è firmato e nessuno è pubblicato. <strong>Linux</strong> — <code>.deb</code>, <code>.rpm</code> e <code>.AppImage</code> sono pubblicati con firme GPG staccate (<code>.sig</code>); SBOM e pacchetti delle estensioni del browser con firme Sigstore senza chiave (<code>.sigstore.json</code>). <strong>Android</strong> — gli APK di release sono firmati con un keystore di release conservato nei segreti di GitHub Actions; la firma Android è separata da Authenticode. Nessuna piattaforma viene descritta come firmata finché non lo è.',
    pt: '<strong>macOS</strong> — os artefactos são assinados com um Apple Developer ID e notarizados pela Apple. O certificado ainda não foi emitido, pelo que nenhum artefacto macOS está assinado e nenhum é publicado. <strong>Linux</strong> — <code>.deb</code>, <code>.rpm</code> e <code>.AppImage</code> são publicados com assinaturas GPG destacadas (<code>.sig</code>); SBOM e pacotes de extensões do navegador com assinaturas Sigstore sem chave (<code>.sigstore.json</code>). <strong>Android</strong> — os APK de lançamento são assinados com um keystore de lançamento guardado nos segredos do GitHub Actions; a assinatura Android é separada da Authenticode. Nenhuma plataforma é descrita como assinada antes de o ser.',
  },

  'csp-p1-24': {
    tr: '<strong>Güncel durum:</strong> Linux, Android ve tarayıcı eklentisi yayımlandı ve imzalı. <strong>Windows yayımlanmadı ve imzasızdır</strong> (başvuru aşamasında). macOS yayımlanmadı ve imzasızdır (sertifika alınmadı).',
    en: '<strong>Current status:</strong> Linux, Android and the browser extension are published and signed. <strong>Windows is not published and unsigned</strong> (application pending). macOS is not published and unsigned (certificate not yet issued).',
    de: '<strong>Aktueller Stand:</strong> Linux, Android und die Browser-Erweiterung sind veröffentlicht und signiert. <strong>Windows ist nicht veröffentlicht und unsigniert</strong> (Antrag ausstehend). macOS ist nicht veröffentlicht und unsigniert (Zertifikat noch nicht ausgestellt).',
    fr: '<strong>État actuel :</strong> Linux, Android et l\'extension de navigateur sont publiés et signés. <strong>Windows n\'est ni publié ni signé</strong> (candidature en cours). macOS n\'est ni publié ni signé (certificat pas encore délivré).',
    es: '<strong>Estado actual:</strong> Linux, Android y la extensión del navegador están publicados y firmados. <strong>Windows no está publicado ni firmado</strong> (solicitud pendiente). macOS no está publicado ni firmado (certificado aún no emitido).',
    it: '<strong>Stato attuale:</strong> Linux, Android e l\'estensione del browser sono pubblicati e firmati. <strong>Windows non è pubblicato né firmato</strong> (candidatura in corso). macOS non è pubblicato né firmato (certificato non ancora emesso).',
    pt: '<strong>Estado atual:</strong> Linux, Android e a extensão do navegador estão publicados e assinados. <strong>Windows não está publicado nem assinado</strong> (candidatura pendente). macOS não está publicado nem assinado (certificado ainda não emitido).',
  },

  'csp-p1-25': {
    tr: 'Windows dosyaları yayımlanmaz, çünkü sürüm hattı imzasız bir masaüstü sürümünü yayımlamak yerine onu başarısızlık sayar. Hattın kapalı (fail-closed) kapısı <a href="https://github.com/hafgit99/kalderashield/blob/main/docs/CODE_SIGNING_GUIDE_2026.md" rel="noopener noreferrer">Kod İmza ve Artefakt İmza Kılavuzu</a>\'nda belgelidir ve imzasız derleme iş akışı (<code>.github/workflows/build-windows-unsigned.yml</code>) bilerek bir sürüm yayımlayamayacak şekilde tasarlanmıştır.',
    en: 'Windows artifacts are not published because the release pipeline treats an unsigned desktop release as a failure rather than shipping one. The pipeline\'s fail-closed gate is documented in the <a href="https://github.com/hafgit99/kalderashield/blob/main/docs/CODE_SIGNING_GUIDE_2026.md" rel="noopener noreferrer">Code Signing &amp; Artifact Signing Guide</a>, and the unsigned build workflow (<code>.github/workflows/build-windows-unsigned.yml</code>) is deliberately unable to publish a release.',
    de: 'Windows-Artefakte werden nicht veröffentlicht, weil die Release-Pipeline ein unsigniertes Desktop-Release als Fehler behandelt, statt eines auszuliefern. Das Fail-closed-Gate der Pipeline ist in der <a href="https://github.com/hafgit99/kalderashield/blob/main/docs/CODE_SIGNING_GUIDE_2026.md" rel="noopener noreferrer">Richtlinie zur Code- und Artefaktsignierung</a> dokumentiert, und der unsignierte Build-Workflow (<code>.github/workflows/build-windows-unsigned.yml</code>) ist absichtlich nicht in der Lage, ein Release zu veröffentlichen.',
    fr: "Les artefacts Windows ne sont pas publiés parce que la chaîne de publication traite une version de bureau non signée comme un échec plutôt que d'en livrer une. La porte qui bloque par défaut est documentée dans le <a href=\"https://github.com/hafgit99/kalderashield/blob/main/docs/CODE_SIGNING_GUIDE_2026.md\" rel=\"noopener noreferrer\">Guide de signature du code et des artefacts</a>, et le workflow de build non signé (<code>.github/workflows/build-windows-unsigned.yml</code>) est délibérément incapable de publier une version.",
    es: 'Los artefactos de Windows no se publican porque la cadena de publicación trata una versión de escritorio sin firmar como un fallo en lugar de distribuir una. La puerta que falla por cierre está documentada en la <a href="https://github.com/hafgit99/kalderashield/blob/main/docs/CODE_SIGNING_GUIDE_2026.md" rel="noopener noreferrer">Guía de firma de código y artefactos</a>, y el flujo de compilación sin firmar (<code>.github/workflows/build-windows-unsigned.yml</code>) está diseñado deliberadamente para no poder publicar una release.',
    it: 'Gli artefatti Windows non sono pubblicati perché la pipeline di rilascio tratta una release desktop non firmata come un fallimento anziché pubblicarne una. Il gate fail-closed della pipeline è documentato nella <a href="https://github.com/hafgit99/kalderashield/blob/main/docs/CODE_SIGNING_GUIDE_2026.md" rel="noopener noreferrer">Guida alla firma di codice e artefatti</a>, e il workflow di build non firmato (<code>.github/workflows/build-windows-unsigned.yml</code>) è deliberatamente incapace di pubblicare una release.',
    pt: 'Os artefactos Windows não são publicados porque a cadeia de lançamento trata um lançamento de ambiente de trabalho sem assinatura como uma falha em vez de publicar um. A porta que falha por omissão está documentada no <a href="https://github.com/hafgit99/kalderashield/blob/main/docs/CODE_SIGNING_GUIDE_2026.md" rel="noopener noreferrer">Guia de assinatura de código e artefactos</a>, e o fluxo de compilação sem assinatura (<code>.github/workflows/build-windows-unsigned.yml</code>) foi deliberadamente construído para não poder publicar um lançamento.',
  },

  'csp-h2-9': {
    tr: '6. Sorun bildirme',
    en: '6. Reporting a problem',
    de: '6. Ein Problem melden',
    fr: '6. Signaler un problème',
    es: '6. Notificar un problema',
    it: '6. Segnalare un problema',
    pt: '6. Comunicar um problema',
  },

  'csp-p1-26': {
    tr: 'SignPath Foundation sertifikasıyla imzalanmış bir dosyanın bu politikayı ihlal ettiğini düşünüyorsanız, dosyanın karmasını ve gerekçeyi <a href="mailto:support@signpath.io">support@signpath.io</a> adresine bildirin. Bu dosyalarla ilgili diğer her konu için <a href="mailto:security@kalderashield.com">security@kalderashield.com</a> adresini kullanın; açıklama süreci <a href="https://github.com/hafgit99/kalderashield/blob/main/SECURITY.md" rel="noopener noreferrer">SECURITY.md</a>\'dedir.',
    en: 'If you believe an artifact signed with a SignPath Foundation certificate violates this policy, report it to <a href="mailto:support@signpath.io">support@signpath.io</a> with the artifact\'s hash and the reason. For anything else about these artifacts, use <a href="mailto:security@kalderashield.com">security@kalderashield.com</a>; the disclosure process is in <a href="https://github.com/hafgit99/kalderashield/blob/main/SECURITY.md" rel="noopener noreferrer">SECURITY.md</a>.',
    de: 'Wenn Sie der Meinung sind, dass ein mit einem SignPath-Foundation-Zertifikat signiertes Artefakt diese Richtlinie verletzt, melden Sie es mit dem Hash des Artefakts und dem Grund an <a href="mailto:support@signpath.io">support@signpath.io</a>. Für alles andere zu diesen Artefakten nutzen Sie <a href="mailto:security@kalderashield.com">security@kalderashield.com</a>; der Offenlegungsprozess steht in <a href="https://github.com/hafgit99/kalderashield/blob/main/SECURITY.md" rel="noopener noreferrer">SECURITY.md</a>.',
    fr: "Si vous pensez qu'un artefact signé avec un certificat SignPath Foundation enfreint cette politique, signalez-le à <a href=\"mailto:support@signpath.io\">support@signpath.io</a> avec le hash de l'artefact et le motif. Pour tout autre sujet concernant ces artefacts, utilisez <a href=\"mailto:security@kalderashield.com\">security@kalderashield.com</a> ; le processus de divulgation se trouve dans <a href=\"https://github.com/hafgit99/kalderashield/blob/main/SECURITY.md\" rel=\"noopener noreferrer\">SECURITY.md</a>.",
    es: 'Si cree que un artefacto firmado con un certificado de SignPath Foundation infringe esta política, notifíquelo a <a href="mailto:support@signpath.io">support@signpath.io</a> con el hash del artefacto y el motivo. Para cualquier otra cuestión sobre estos artefactos, use <a href="mailto:security@kalderashield.com">security@kalderashield.com</a>; el proceso de divulgación está en <a href="https://github.com/hafgit99/kalderashield/blob/main/SECURITY.md" rel="noopener noreferrer">SECURITY.md</a>.',
    it: "Se ritiene che un artefatto firmato con un certificato SignPath Foundation violi questa informativa, segnalarlo a <a href=\"mailto:support@signpath.io\">support@signpath.io</a> con l'hash dell'artefatto e il motivo. Per qualsiasi altra questione su questi artefatti usare <a href=\"mailto:security@kalderashield.com\">security@kalderashield.com</a>; il processo di divulgazione è in <a href=\"https://github.com/hafgit99/kalderashield/blob/main/SECURITY.md\" rel=\"noopener noreferrer\">SECURITY.md</a>.",
    pt: 'Se acredita que um artefacto assinado com um certificado da SignPath Foundation viola esta política, comunique-o a <a href="mailto:support@signpath.io">support@signpath.io</a> com o resumo do artefacto e o motivo. Para qualquer outra questão sobre estes artefactos, use <a href="mailto:security@kalderashield.com">security@kalderashield.com</a>; o processo de divulgação está em <a href="https://github.com/hafgit99/kalderashield/blob/main/SECURITY.md" rel="noopener noreferrer">SECURITY.md</a>.',
  },

  'csp-governing': {
    tr: 'Çeviri ile Türkçe metin arasında bir farklılık olması hâlinde Türkçe metin esas alınır.',
    en: 'In case of any discrepancy, the Turkish text of this policy governs.',
    de: 'Bei Abweichungen ist der türkische Text dieser Richtlinie maßgeblich.',
    fr: 'En cas de divergence, le texte turc de cette politique fait foi.',
    es: 'En caso de discrepancia, prevalece el texto en turco de esta política.',
    it: 'In caso di discordanza, fa fede il testo turco di questa informativa.',
    pt: 'Em caso de divergência, prevalece o texto em turco desta política.',
  },
};

apply(I18N_DIR, CODES, TRANSLATIONS);
