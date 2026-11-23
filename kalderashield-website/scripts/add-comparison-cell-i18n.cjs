#!/usr/bin/env node
/* Adds the comparison table's cell strings to the twelve dictionaries.
 *
 * The table itself is short by design -- five criteria, three short answers each
 * -- and it was that shape everyone recognised. The dictionaries, however, only
 * carried a long-form prose matrix that nothing referenced, so the cells
 * shipped as hardcoded Turkish and every language rendered them untranslated.
 *
 * These are the missing strings for the compact table. They are ordinary
 * interface vocabulary -- "Required", "On your device", "Open source" -- kept
 * short on purpose: the point of the table is that it can be scanned in a
 * glance, and a translated cell that runs to a sentence defeats it.
 *
 * Idempotent: existing values are left alone, so a translator's wording is
 * never overwritten by a re-run.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const I18N = path.join(root, 'assets', 'js', 'i18n');
const LOCALES = ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar'];

const ROWS = {
  'comp-row-server': {
    tr: 'Sunucu gereksinimi', en: 'Server requirement', de: 'Serveranforderung',
    fr: 'Serveur requis', es: 'Requisito de servidor', it: 'Requisito del server',
    pt: 'Requisito de servidor', ru: 'Требуется сервер', ja: 'サーバー要件',
    ko: '서버 필요', zh: '需要服务器', ar: 'يتطلب خادمًا',
  },
  'comp-row-account': {
    tr: 'Hesap zorunluluğu', en: 'Account requirement', de: 'Kontoanforderung',
    fr: 'Compte obligatoire', es: 'Requisito de cuenta', it: 'Requisito di account',
    pt: 'Requisito de conta', ru: 'Требуется учётная запись', ja: 'アカウント要件',
    ko: '계정 필요', zh: '需要账户', ar: 'يتطلب حسابًا',
  },
  'comp-row-location': {
    tr: 'Veri konumu', en: 'Data location', de: 'Speicherort der Daten',
    fr: 'Emplacement des données', es: 'Ubicación de los datos', it: 'Posizione dei dati',
    pt: 'Localização dos dados', ru: 'Расположение данных', ja: 'データの保存場所',
    ko: '데이터 위치', zh: '数据位置', ar: 'موقع البيانات',
  },
  'comp-row-offline': {
    tr: 'Ağ olmadan çalışma', en: 'Works without a network', de: 'Betrieb ohne Netzwerk',
    fr: 'Fonctionne sans réseau', es: 'Funciona sin red', it: 'Funziona senza rete',
    pt: 'Funciona sem rede', ru: 'Работа без сети', ja: 'ネットワークなしで動作',
    ko: '네트워크 없이 작동', zh: '无网络运行', ar: 'يعمل بدون شبكة',
  },
  'comp-row-opensource': {
    tr: 'Açık kaynak', en: 'Open source', de: 'Quelloffen', fr: 'Code source ouvert',
    es: 'Código abierto', it: 'Open source', pt: 'Código aberto', ru: 'Открытый исходный код',
    ja: 'オープンソース', ko: '오픈 소스', zh: '开源', ar: 'مفتوح المصدر',
  },
  'comp-row-peritem': {
    tr: 'Kayıt başına HKDF anahtar izolasyonu', en: 'Per-record HKDF key isolation',
    de: 'HKDF-Schlüsselisolation pro Eintrag', fr: 'Isolation de clé HKDF par entrée',
    es: 'Aislamiento de clave HKDF por registro', it: 'Isolamento chiave HKDF per voce',
    pt: 'Isolamento de chave HKDF por item', ru: 'Изоляция ключей HKDF на запись',
    ja: '項目ごとの HKDF 鍵分離', ko: '항목별 HKDF 키 격리',
    zh: '逐条记录 HKDF 密钥隔离', ar: 'عزل مفاتيح HKDF لكل سجل',
  },
  'comp-row-passkeys': {
    tr: 'Passkey (WebAuthn) ve biyometri', en: 'Passkeys (WebAuthn) & biometrics',
    de: 'Passkeys (WebAuthn) & Biometrie', fr: 'Passkeys (WebAuthn) et biométrie',
    es: 'Passkeys (WebAuthn) y biometría', it: 'Passkey (WebAuthn) e biometria',
    pt: 'Passkeys (WebAuthn) e biometria', ru: 'Passkeys (WebAuthn) и биометрия',
    ja: 'Passkey（WebAuthn）と生体認証', ko: 'Passkey(WebAuthn) 및 생체 인증',
    zh: 'Passkey (WebAuthn) 与生物识别', ar: 'مفاتيح المرور (WebAuthn) والقياسات الحيوية',
  },
  'comp-row-ext': {
    tr: 'Kapalı Shadow DOM + eTLD+1 eklenti', en: 'Closed Shadow DOM + eTLD+1 extension',
    de: 'Geschlossenes Shadow DOM + eTLD+1', fr: 'Shadow DOM fermé + extension eTLD+1',
    es: 'Shadow DOM cerrado + extensión eTLD+1', it: 'Shadow DOM chiuso + estensione eTLD+1',
    pt: 'Shadow DOM fechado + extensão eTLD+1', ru: 'Закрытый Shadow DOM + eTLD+1',
    ja: 'クローズド Shadow DOM + eTLD+1 拡張', ko: '폐쇄형 Shadow DOM + eTLD+1 확장',
    zh: '封闭 Shadow DOM + eTLD+1 扩展', ar: 'إضافة Shadow DOM مغلق + eTLD+1',
  },
  'comp-row-airgap': {
    tr: 'Air-gap ağ çıkış koruması', en: 'Air-gap network egress policy',
    de: 'Air-Gap-Netzwerkausgangsrichtlinie', fr: 'Politique réseau air-gap sortante',
    es: 'Política de salida de red air-gap', it: 'Politica di uscita di rete air-gap',
    pt: 'Política de saída de rede air-gap', ru: 'Политика исходящей сети Air-Gap',
    ja: 'エアギャップ通信制御ポリシー', ko: '에어갭 네트워크 송신 차단 정책',
    zh: '气隙网络出站阻断策略', ar: 'سياسة حظر الاتصال الصادر (Air-Gap)',
  },
};

const VALUES = {
  'comp-val-none': {
    tr: 'Yok', en: 'None', de: 'Keiner', fr: 'Aucun', es: 'Ninguno', it: 'Nessuno',
    pt: 'Nenhum', ru: 'Нет', ja: '不要', ko: '없음', zh: '无', ar: 'لا شيء',
  },
  'comp-val-required': {
    tr: 'Zorunlu', en: 'Required', de: 'Erforderlich', fr: 'Obligatoire',
    es: 'Obligatorio', it: 'Obbligatorio', pt: 'Obrigatório', ru: 'Обязательно',
    ja: '必須', ko: '필수', zh: '必需', ar: 'مطلوب',
  },
  'comp-val-device': {
    tr: 'Cihazınızda', en: 'On your device', de: 'Auf Ihrem Gerät', fr: 'Sur votre appareil',
    es: 'En tu dispositivo', it: 'Sul tuo dispositivo', pt: 'No seu dispositivo',
    ru: 'На вашем устройстве', ja: 'お使いのデバイス', ko: '기기에서', zh: '在您的设备上',
    ar: 'على جهازك',
  },
  'comp-val-vendor-server': {
    tr: 'Satıcının sunucusunda', en: "On the vendor's server", de: 'Auf dem Server des Anbieters',
    fr: 'Sur le serveur du fournisseur', es: 'En el servidor del proveedor',
    it: 'Sul server del fornitore', pt: 'No servidor do fornecedor',
    ru: 'На сервере поставщика', ja: '提供元のサーバー上', ko: '제공업체 서버에',
    zh: '在供应商服务器上', ar: 'على خادم المزوّد',
  },
  'comp-val-full': {
    tr: 'Tam', en: 'Full', de: 'Vollständig', fr: 'Complet', es: 'Completo', it: 'Completo',
    pt: 'Completo', ru: 'Полностью', ja: '完全に', ko: '완전', zh: '完全', ar: 'كامل',
  },
  'comp-val-no': {
    tr: 'Hayır', en: 'No', de: 'Nein', fr: 'Non', es: 'No', it: 'No', pt: 'Não',
    ru: 'Нет', ja: 'いいえ', ko: '아니요', zh: '否', ar: 'لا',
  },
  'comp-val-yes': {
    tr: 'Evet', en: 'Yes', de: 'Ja', fr: 'Oui', es: 'Sí', it: 'Sì', pt: 'Sim',
    ru: 'Да', ja: 'はい', ko: '예', zh: '是', ar: 'نعم',
  },
  'comp-val-varies': {
    tr: 'Değişir', en: 'Varies', de: 'Unterschiedlich', fr: 'Variable', es: 'Varía',
    it: 'Variabile', pt: 'Variável', ru: 'Различается', ja: '製品により異なる',
    ko: '제품마다 다름', zh: '视产品而定', ar: 'يختلف',
  },
};

const ALL = Object.assign({}, ROWS, VALUES);

const problems = [];
for (const [key, byLocale] of Object.entries(ALL)) {
  for (const locale of LOCALES) {
    if (typeof byLocale[locale] !== 'string' || !byLocale[locale].trim()) {
      problems.push(`${key}: ${locale} eksik`);
    }
  }
}
if (problems.length) {
  console.error('Ceviri tablosunda eksik deger:');
  for (const p of problems) console.error(' -', p);
  process.exit(1);
}

let added = 0;
let kept = 0;

for (const locale of LOCALES) {
  const file = path.join(I18N, locale + '.json');
  const dict = JSON.parse(fs.readFileSync(file, 'utf8'));

  // Inserted next to the other comparison keys rather than appended, and the
  // file is otherwise left in its existing order. These dictionaries are read
  // and diffed by hand, and re-sorting twelve files of 1365 keys to add thirteen
  // would bury the change.
  const out = {};
  let placed = false;
  for (const [k, v] of Object.entries(dict)) {
    if (!placed && k.startsWith('comp-')) {
      for (const [key, byLocale] of Object.entries(ALL)) {
        if (typeof dict[key] === 'string' && dict[key].trim()) {
          out[key] = dict[key];
          kept++;
        } else {
          out[key] = byLocale[locale];
          added++;
        }
      }
      placed = true;
    }
    out[k] = v;
  }
  // No comp- keys at all: fall back to appending rather than silently dropping.
  if (!placed) {
    for (const [key, byLocale] of Object.entries(ALL)) {
      if (typeof dict[key] === 'string' && dict[key].trim()) {
        out[key] = dict[key];
        kept++;
      } else {
        out[key] = byLocale[locale];
        added++;
      }
    }
  }

  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8');
}

console.log(`${Object.keys(ALL).length} anahtar · ${LOCALES.length} dil`);
console.log(`  eklendi: ${added}`);
console.log(`  mevcuttu, dokunulmadi: ${kept}`);