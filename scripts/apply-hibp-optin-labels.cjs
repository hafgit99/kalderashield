/**
 * Rewrites the breach-check labels in all twelve locales.
 *
 *   node scripts/apply-hibp-optin-labels.cjs
 *
 * The check is now opt-in (see src/lib/hibp.ts). Two labels described the old
 * default rather than the state: "OFFLINE" and "Offline (HIBP Disabled)" were
 * accurate while the feature was on-by-default and unreachable, and misleading
 * the moment it was off — "offline" is a network condition, and this is a
 * user's decision that persists.
 *
 * Kept as a script rather than twelve hand edits, because the locale files are
 * key-parity checked: a value changed in one language and not the others is a
 * finding, and the fix for that is mechanical.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..', 'src', 'i18n', 'locales');

/** [locale, badge when the check is off, sentence shown under the counter]. */
const VALUES = {
  tr: ['KAPALI', 'Kapalı — HIBP sorgusu yapılmıyor'],
  en: ['OFF', 'Disabled — no HIBP lookup'],
  de: ['AUS', 'Deaktiviert — keine HIBP-Abfrage'],
  fr: ['ARRÊT', 'Désactivé — aucune requête HIBP'],
  es: ['APAGADO', 'Desactivado — sin consulta a HIBP'],
  it: ['SPENTO', 'Disattivato — nessuna richiesta HIBP'],
  pt: ['DESLIGADO', 'Desativado — sem consulta ao HIBP'],
  ru: ['ВЫКЛ', 'Отключено — запросы к HIBP не выполняются'],
  ja: ['オフ', '無効 — HIBP への問い合わせは行われません'],
  zh: ['关闭', '已关闭 — 不进行 HIBP 查询'],
  ko: ['꺼짐', '비활성화 — HIBP 조회 없음'],
  ar: ['مُعطَّل', 'معطّل — لا يتم إرسال أي استعلام إلى HIBP'],
};

const KEYS = {
  'securityAudit.hibpStatusOffline': 0,
  'securityAudit.pwnedDisabled': 1,
};

let changed = 0;
let missing = [];

for (const [locale, values] of Object.entries(VALUES)) {
  const file = path.join(DIR, `${locale}.ts`);
  let text = fs.readFileSync(file, 'utf8');

  for (const [key, index] of Object.entries(KEYS)) {
    const re = new RegExp(`('${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':\\s*)'([^']*)'`);
    if (!re.test(text)) {
      missing.push(`${locale}: ${key}`);
      continue;
    }
    const next = text.replace(re, (_, prefix) => `${prefix}'${values[index].replace(/'/g, "\\'")}'`);
    if (next !== text) {
      fs.writeFileSync(file, next, 'utf8');
      text = next;
      changed++;
    }
  }
}

if (missing.length) {
  console.error('anahtarlar bulunamadi:');
  missing.forEach((m) => console.error(`  ${m}`));
  process.exit(1);
}

console.log(`${changed} etiket guncellendi (${Object.keys(VALUES).length} dil).`);