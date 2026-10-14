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

/**
 * Rewrite a locale file in place, through one descriptor.
 *
 * CodeQL flagged the read-then-write-by-name shape as `js/file-system-race`.
 * The fix is not to argue that nothing here is hostile -- a locale file is
 * source code that ships, and this runs in a working tree -- it is to stop
 * naming the file twice. One descriptor means the bytes that were read and the
 * bytes that replace them belong to the same file, whatever happens to the
 * directory in between. Reading through that same descriptor matters as much as
 * writing through it: a `readFileSync(file)` followed by an `openSync(file)` is
 * the same check-then-use pair with the check moved.
 *
 * `truncate` plus an explicit write position matter: the descriptor is still
 * positioned at the end of what it read, so writing without them leaves the tail
 * of the old content after the new, and a source file that still parses is a
 * file that silently lost everything after the edit point.
 *
 * The transform returns the new text, or nothing to leave the file alone.
 */
function updateLocaleFile(file, transform) {
  const fd = fs.openSync(file, 'r+');
  try {
    const current = fs.readFileSync(fd, 'utf8');
    const next = transform(current);
    if (!next || next === current) return false;

    fs.ftruncateSync(fd, 0);
    fs.writeSync(fd, next, 0, 'utf8');
    return true;
  } finally {
    fs.closeSync(fd);
  }
}

let changed = 0;
const missing = [];

for (const [locale, values] of Object.entries(VALUES)) {
  const file = path.join(DIR, `${locale}.ts`);

  const rewrote = updateLocaleFile(file, (text) => {
    let next = text;
    for (const [key, index] of Object.entries(KEYS)) {
      const re = new RegExp(`('${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}':\\s*)'([^']*)'`);
      if (!re.test(next)) {
        missing.push(`${locale}: ${key}`);
        continue;
      }
      next = next.replace(re, (_, prefix) => `${prefix}'${values[index].replace(/'/g, "\\'")}'`);
    }
    return next;
  });

  if (rewrote) {
    changed += Object.keys(KEYS).length - missing.filter((m) => m.startsWith(`${locale}:`)).length;
  }
}

if (missing.length) {
  console.error('anahtarlar bulunamadi:');
  missing.forEach((m) => console.error(`  ${m}`));
  process.exit(1);
}

console.log(`${changed} etiket guncellendi (${Object.keys(VALUES).length} dil).`);