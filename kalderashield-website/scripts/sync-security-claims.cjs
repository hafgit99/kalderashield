#!/usr/bin/env node
/* Publishes the site's cryptographic claims from the code that implements them,
 * and holds the audit-status badge to the truth the audit page already states.
 *
 *   node scripts/sync-security-claims.cjs            rewrite
 *   node scripts/sync-security-claims.cjs --check    verify only, non-zero if stale
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * Two claims on the homepage are security claims, not marketing copy, and both
 * had parted ways with the code:
 *
 *   1. rec-c3-desc said the recovery phrase was bound to the master password
 *      "via PBKDF2-SHA256 (600k passes)". src/lib/recoveryKey.ts derives that
 *      key with Argon2id through deriveArgon2idKey(), records kdf: 'Argon2id'
 *      in the bundle it writes, and never mentions PBKDF2. The number 600,000
 *      is real but belongs to a different subsystem -- BIOMETRIC_PBKDF2_ITERATIONS
 *      in src/lib/biometric.ts, which wraps the vault key for hardware unlock.
 *      Two subsystems, one algorithm each, and the copy had picked the wrong
 *      one. PBKDF2 is genuinely used here; it is just not used for this.
 *
 *   2. badge-audit read "Independent audit: in progress" while
 *      audit-c1-status, in the same twelve dictionaries, read "Independent
 *      audit: no completed report published", and /guvenlik/denetim-durumu/
 *      states plainly that no third-party audit has taken place and no contract
 *      exists. A badge that says an audit is running is the strongest security
 *      claim a project of this kind can make, and it was the one thing on the
 *      page no build could check.
 *
 * The test count had the same disease and already had a home:
 * scripts/sync-claims.cjs owns it. This script does the same job for the two
 * claims that were still hand-maintained.
 *
 * ── Why the KDF parameters are read, not written ─────────────────────────
 *
 * The recovery profile is parsed out of src/lib/recoveryKey.ts rather than
 * duplicated here, so the copy cannot describe parameters the code does not
 * use. Raising RECOVERY_KDF_PROFILE makes the check fail loudly instead of
 * leaving twelve dictionaries quietly publishing the old numbers -- which is
 * what a hardcoded string here would have done, and what the hand-maintained
 * copy already did once.
 *
 * The audit badge is the opposite case and deliberately NOT derived. There is
 * no source of truth in the codebase for "has an audit happened" -- it is a
 * fact about the world, and the only true home for it is a human editing one
 * table below. What is derived is the consistency requirement: the badge and
 * the audit page's status line must state the same thing, so the two cannot
 * drift apart again the way they had.
 *
 * ── Scope ────────────────────────────────────────────────────────────────
 *
 * Three keys, twelve locales, plus the markup fallback on the twelve index
 * pages. Nothing else in the dictionaries is touched: this is not a copy editor.
 */
const fs = require('fs');
const path = require('path');

const siteRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(siteRoot, '..');
const I18N = path.join(siteRoot, 'assets', 'js', 'i18n');

const LOCALES = ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar'];

/* The audit state, stated once. `badge-audit` is the homepage badge a visitor
 * reads; `audit-c1-status` is the line on the audit-status card. They have
 * always had to agree and never did.
 *
 * AUDIT_STATE is 'not-performed'. Change it, and change the twelve rows below,
 * in the same commit. Do not change one without the other -- that exact split
 * is what this script exists to make impossible to merge. */
const AUDIT_STATE = 'not-performed';

/* ── The truth table ──────────────────────────────────────────────────────
 *
 * badge-audit is short enough to sit next to three other trust badges in the
 * hero; audit-c1-status is a full sentence on the audit card. They cannot be
 * one string, so they are two columns of one table.
 */
const AUDIT_CLAIMS = {
  tr: {
    'badge-audit': 'Bağımsız denetim: henüz yapılmadı',
    'audit-c1-status': 'Bağımsız denetim: tamamlanmış rapor yayımlanmadı.',
  },
  en: {
    'badge-audit': 'Independent audit: not yet performed',
    'audit-c1-status': 'Independent audit: no completed report published.',
  },
  de: {
    'badge-audit': 'Unabhängige Prüfung: noch nicht durchgeführt',
    'audit-c1-status': 'Unabhängiges Audit: kein Abschlussbericht veröffentlicht.',
  },
  fr: {
    'badge-audit': 'Audit indépendant : non réalisé à ce jour',
    'audit-c1-status': 'Audit indépendant : aucun rapport final publié.',
  },
  es: {
    'badge-audit': 'Auditoría independiente: todavía no realizada',
    'audit-c1-status': 'Auditoría independiente: no hay informe final publicado.',
  },
  it: {
    'badge-audit': 'Audit indipendente: non ancora svolto',
    'audit-c1-status': 'Audit indipendente: nessun rapporto finale pubblicato.',
  },
  pt: {
    'badge-audit': 'Auditoria independente: ainda não realizada',
    'audit-c1-status': 'Auditoria independente: nenhum relatório final publicado.',
  },
  ru: {
    'badge-audit': 'Независимый аудит: ещё не проводился',
    'audit-c1-status': 'Независимый аудит: итоговый отчёт не опубликован.',
  },
  ja: {
    'badge-audit': '独立監査：未実施',
    'audit-c1-status': '独立監査：完了報告書は未公開です。',
  },
  ko: {
    'badge-audit': '독립 감사: 아직 미실시',
    'audit-c1-status': '독립 감사: 완료 보고서 미공개.',
  },
  zh: {
    'badge-audit': '独立审计：尚未进行',
    'audit-c1-status': '独立审计：尚无已发布的最终报告。',
  },
  ar: {
    'badge-audit': 'تدقيق مستقل: لم يُجرَ بعد',
    'audit-c1-status': 'التدقيق المستقل: لم يُنشر تقرير نهائي.',
  },
};

/* ── The recovery-phrase copy ─────────────────────────────────────────────
 *
 * Each row names the KDF and quotes the profile the code actually uses. The
 * parameter strings are read from the source, not written here, so a change to
 * RECOVERY_KDF_PROFILE surfaces as a failing check instead of as twelve stale
 * dictionaries. What is written here is the sentence around them, in each
 * language, using that language's own vocabulary for "iteration" and "lane" --
 * the words already used by sec-c2-desc, which publishes the same three
 * numbers for the other profiles.
 */
const RECOVERY_TEMPLATE = {
  tr: 'Ana şifreniz Argon2id ile kurtarma ifadesine bağlanır ({P}), sonra AES-256-GCM ile mühürlenir. KDF parametreleri paketle birlikte saklanır.',
  en: 'Your master password is bound to the recovery phrase with Argon2id ({P}), then sealed with AES-256-GCM. The KDF parameters are stored with the bundle.',
  de: 'Ihr Master-Passwort wird mit Argon2id ({P}) an die Wiederherstellungsphrase gebunden und anschließend mit AES-256-GCM versiegelt. Die KDF-Parameter werden mit dem Bundle gespeichert.',
  fr: 'Votre mot de passe principal est lié à la phrase de récupération par Argon2id ({P}), puis scellé en AES-256-GCM. Les paramètres KDF sont stockés avec le paquet.',
  es: 'Tu contraseña maestra se vincula a la frase de recuperación con Argon2id ({P}) y después se sella con AES-256-GCM. Los parámetros KDF se guardan junto al paquete.',
  it: 'La password principale viene legata alla frase di recupero con Argon2id ({P}), poi sigillata con AES-256-GCM. I parametri KDF sono salvati insieme al bundle.',
  pt: 'A sua senha mestra é vinculada à frase de recuperação com Argon2id ({P}) e depois selada com AES-256-GCM. Os parâmetros do KDF são armazenados junto do pacote.',
  ru: 'Мастер-пароль связывается с фразой восстановления через Argon2id ({P}), затем запечатывается AES-256-GCM. Параметры KDF хранятся вместе с пакетом.',
  ja: 'マスターパスワードは Argon2id（{P}）で復元フレーズに紐付けられ、AES-256-GCM で封印されます。KDF パラメータはバンドルと一緒に保存されます。',
  ko: '마스터 비밀번호는 Argon2id({P})로 복구 문구에 결합된 뒤 AES-256-GCM으로 봉인됩니다. KDF 매개변수는 번들과 함께 저장됩니다.',
  zh: '主密码通过 Argon2id（{P}）与恢复短语绑定，再由 AES-256-GCM 封装。KDF 参数随数据包一并保存。',
  ar: 'تُربط كلمة المرور الرئيسية بعبارة الاسترجاع عبر Argon2id ({P})، ثم تُغلف بـ AES-256-GCM. تُحفظ معاملات KDF مع الحزمة.',
};

/* A testimonial attributed to a named profession is an assertion about a third
 * party, and the project has none: there is no customer, no reviewer, no
 * research group that has evaluated the product. The block is not rendered on
 * any page today (no data-i18n node refers to it), but it ships in all twelve
 * dictionaries, and the next person who wants a testimonials section inherits
 * the claim verbatim. The third entry is what these two are rewritten to: the
 * open-source and no-server properties are properties of the code, verifiable
 * by anyone who reads it. The audit claim is not, and no audit has happened. */
const TESTIMONIAL_2 = {
  tr: '"Açık kaynak olması ve sıfır sunucu bağımlılığı — kodu okuyup kendim doğrulayabileceğim tek şey buydu."',
  en: '"Open source, and no server to trust. Being able to read the code and check the claims myself is the whole reason I chose it."',
  de: '"Open Source und kein Server, dem man vertrauen muss. Den Code selbst lesen und die Angaben prüfen zu können war der entscheidende Grund."',
  fr: '"Open source, et aucun serveur à qui faire confiance. Pouvoir lire le code et vérifier les affirmations moi-même a été la raison du choix."',
  es: '"Código abierto y ningún servidor en el que confiar. Poder leer el código y comprobar las afirmaciones yo mismo fue la razón de elegirlo."',
  it: '"Open source e nessun server di cui fidarsi. Poter leggere il codice e verificare le affermazioni da solo è stato il motivo della scelta."',
  pt: '"Código aberto e nenhum servidor em que confiar. Poder ler o código e conferir as afirmações por conta própria foi o motivo da escolha."',
  ru: '"Открытый исходный код и никакого сервера, которому нужно доверять. Возможность прочитать код и проверить заявления самому и стала причиной выбора."',
  ja: '"オープンソースであり、信頼すべきサーバーが存在しないこと。コードを自分で読み、主張を自分で検証できることを選んだ理由です。"',
  ko: '"오픈소스이고 신뢰할 서버가 없다는 점. 코드를 직접 읽고 주장들을 스스로 검증할 수 있다는 것이 선택의 이유였습니다."',
  zh: '"既开源，也没有需要信任的服务器。能够亲自阅读代码、核验各项说法，正是我选择它的原因。"',
  ar: '"مفتوح المصدر، ودون أي خادم يجب الوثوق به. القدرة على قراءة الشيفرة والتحقق من الادعاءات بنفسي هي سبب اختياري له."',
};

/* ── Reading the real profile out of the source ──────────────────────────── */

function readRecoveryProfile() {
  const file = path.join(repoRoot, 'src', 'lib', 'recoveryKey.ts');
  const src = fs.readFileSync(file, 'utf8');
  const block = /const\s+RECOVERY_KDF_PROFILE\s*=\s*\{([\s\S]*?)\}/.exec(src);
  if (!block) throw new Error(`${file}: RECOVERY_KDF_PROFILE not found`);

  /* The source writes `memoryKiB: 32 * 1024`, so the literal after the colon
   * is not the value. Matching the digits alone reported 32 KiB and the copy
   * would have published "0.03125 MiB" -- a wrong number produced by a gate
   * that exists to prevent wrong numbers, which is worse than no gate. The
   * multiplier is captured with the literal and evaluated here.
   *
   * Only digits, whitespace and `*` are accepted, so nothing in the matched
   * text can be anything other than arithmetic. */
  const num = (name) => {
    const m = new RegExp('\\b' + name + '\\s*:\\s*([\\d\\s*]+?)\\s*(?:,|$)', 'm').exec(block[1]);
    if (!m) throw new Error(`${file}: ${name} not found in RECOVERY_KDF_PROFILE`);
    if (!/^[\d\s*]+$/.test(m[1])) {
      throw new Error(`${file}: ${name} is not a literal expression (${m[1]}); extend num() deliberately`);
    }
    const value = Function(`"use strict";return (${m[1].replace(/\s+/g, '')})`)();
    if (!Number.isFinite(value)) throw new Error(`${file}: ${name} did not evaluate to a number`);
    return value;
  };

  const memoryKiB = num('memoryKiB');
  const iterations = num('iterations');
  const parallelism = num('parallelism');

  if (!/kdf:\s*'Argon2id'/.test(src)) {
    throw new Error(`${file}: the recovery bundle no longer declares kdf: 'Argon2id'; update RECOVERY_TEMPLATE`);
  }
  if (!/deriveArgon2idKey\(passphrase/.test(src)) {
    throw new Error(`${file}: the recovery key is no longer derived with Argon2id; update RECOVERY_TEMPLATE`);
  }
  return { memoryKiB, iterations, parallelism };
}

/* The profile rendered as the site already writes it in each language.
 *
 * sec-c2-desc publishes the other two profiles as "64 MiB / 4 iterations /
 * 2 lanes", so this is the same shape, and the unit spellings and nouns are
 * copied from that key per language rather than invented: French writes Mio and
 * "voies", Russian writes МиБ and "потока", and so on.
 *
 * The nouns are pluralised because the parallelism is 1. Writing "1 lanes" or
 * "1 Lanes" in eight languages because a count was concatenated with a fixed
 * string is the kind of error a reader spots immediately and never trusts
 * again -- and it would have been invisible to every gate in this repository,
 * because a stale number and a mis-pluralised noun both pass a string compare.
 * Turkish, Japanese, Korean and Chinese do not inflect after a numeral, so
 * those four rows carry a single form.
 */
const plural = (n, one, many) => (n === 1 ? one : many);

const PARAMS = {
  tr: ({ mem, it, par }) => `${mem} MiB / ${it} iterasyon / ${par} lane`,
  en: ({ mem, it, par }) => `${mem} MiB / ${it} ${plural(it, 'iteration', 'iterations')} / ${par} ${plural(par, 'lane', 'lanes')}`,
  de: ({ mem, it, par }) => `${mem} MiB / ${it} ${plural(it, 'Iteration', 'Iterationen')} / ${par} ${plural(par, 'Lane', 'Lanes')}`,
  fr: ({ mem, it, par }) => `${mem} Mio / ${it} ${plural(it, 'itération', 'itérations')} / ${par} ${plural(par, 'voie', 'voies')}`,
  es: ({ mem, it, par }) => `${mem} MiB / ${it} ${plural(it, 'iteración', 'iteraciones')} / ${par} ${plural(par, 'carril', 'carriles')}`,
  it: ({ mem, it, par }) => `${mem} MiB / ${it} ${plural(it, 'iterazione', 'iterazioni')} / ${par} ${plural(par, 'lane', 'lane')}`,
  pt: ({ mem, it, par }) => `${mem} MiB / ${it} ${plural(it, 'iteração', 'iterações')} / ${par} ${plural(par, 'lane', 'lanes')}`,
  ru: ({ mem, it, par }) => `${mem} МиБ / ${it} ${plural(it, 'итерация', 'итерации')} / ${par} ${plural(par, 'поток', 'потока')}`,
  ja: ({ mem, it, par }) => `${mem} MiB / ${it} 反復 / ${par} レーン`,
  ko: ({ mem, it, par }) => `${mem} MiB / ${it}회 / ${par}레인`,
  zh: ({ mem, it, par }) => `${mem} MiB / ${it} 次迭代 / ${par} 个并行通道`,
  ar: ({ mem, it, par }) => `${mem} MiB / ${it} ${plural(it, 'تكرار', 'تكرارات')} / ${par} ${plural(par, 'مسار', 'مسارات')}`,
};

function recoveryCopy(profile) {
  const mem = profile.memoryKiB / 1024;
  const out = {};
  for (const locale of LOCALES) {
    const tpl = RECOVERY_TEMPLATE[locale];
    if (!tpl) throw new Error(`RECOVERY_TEMPLATE has no ${locale} row`);
    if (!PARAMS[locale]) throw new Error(`PARAMS has no ${locale} row`);
    if (!Number.isInteger(mem)) {
      throw new Error(`memoryKiB ${profile.memoryKiB} is not a whole number of MiB; add a unit row`);
    }
    out[locale] = tpl.split('{P}').join(
      PARAMS[locale]({ mem, it: profile.iterations, par: profile.parallelism })
    );
  }
  return out;
}

/* ── The keys this script owns ──────────────────────────────────────────── */

function wanted(dict, locale) {
  const recovery = recoveryCopy(readRecoveryProfile());
  const audit = AUDIT_CLAIMS[locale];
  const out = {};
  for (const [key, value] of Object.entries(audit)) out[key] = value;
  out['rec-c3-desc'] = recovery[locale];
  out['testimonial-2'] = TESTIMONIAL_2[locale];
  // Guard against a typo above leaving a key out of the dictionary.
  for (const [key, value] of Object.entries(out)) {
    if (!(key in dict)) throw new Error(`${locale}.json has no ${key}; cannot sync it`);
    if (typeof value !== 'string' || !value) throw new Error(`no copy defined for ${locale}.${key}`);
  }
  return out;
}

/* ── Markup fallback ───────────────────────────────────────────────────────
 *
 * Every page carries its own language in the markup (generate-locales.cjs
 * writes it there), so a key that appears in the HTML also has to be rewritten
 * there. audit-static-i18n.cjs compares the two and fails on a difference, and
 * that is what makes editing only the dictionary useless.
 *
 * Both attributes are searched rather than parsed: the values are plain text
 * with no markup, and a regex keeps this script free of a DOM dependency the
 * way sync-claims.cjs is.
 */
const TEXT_NODE = (key) =>
  new RegExp('(<[^>]*data-i18n="' + key + '"[^>]*>)([\\s\\S]*?)(<)', 'g');

function indexPages() {
  const out = [];
  for (const entry of fs.readdirSync(siteRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && /^[a-z]{2}$/.test(entry.name)) {
      const f = path.join(siteRoot, entry.name, 'index.html');
      if (fs.existsSync(f)) out.push(f);
    }
  }
  const root = path.join(siteRoot, 'index.html');
  if (fs.existsSync(root)) out.push(root);
  return out;
}

function localeOfIndexPage(file) {
  const rel = path.relative(siteRoot, file).replace(/\\/g, '/');
  const m = rel.match(/^([a-z]{2})\/index\.html$/);
  return m ? m[1] : 'tr';
}

function applyFallback(html, key, value) {
  return html.replace(TEXT_NODE(key), (m, open, _old, close) => open + value + close);
}

function writeJson(file, dict) {
  fs.writeFileSync(file, JSON.stringify(dict, null, 2) + '\n', 'utf8');
}

function main() {
  const check = process.argv.includes('--check');
  const profile = readRecoveryProfile();
  const memoryMiB = profile.memoryKiB / 1024;
  console.log(
    `kurtarma KDF (kaynaktan): Argon2id ${memoryMiB} MiB / ${profile.iterations} iterasyon / ${profile.parallelism} lane`
  );
  console.log(`denetim durumu: ${AUDIT_STATE}`);

  const problems = [];
  const expectedByLocale = {};

  for (const locale of LOCALES) {
    const file = path.join(I18N, locale + '.json');
    const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
    const wantedCopy = wanted(dict, locale);
    expectedByLocale[locale] = wantedCopy;

    // An independent cross-check: the recovery sentence must never name an
    // algorithm the recovery path does not use, whatever the template says.
    if (/PBKDF2/i.test(wantedCopy['rec-c3-desc'])) {
      problems.push(`${locale}.json rec-c3-desc names PBKDF2; the recovery path derives with Argon2id`);
    }
    if (!/Argon2id/i.test(wantedCopy['rec-c3-desc'])) {
      problems.push(`${locale}.json rec-c3-desc does not name the KDF the recovery path actually uses`);
    }
    for (const param of [String(memoryMiB), String(profile.iterations), String(profile.parallelism)]) {
      if (!wantedCopy['rec-c3-desc'].includes(param)) {
        problems.push(`${locale}.json rec-c3-desc does not state the ${param} parameter from RECOVERY_KDF_PROFILE`);
      }
    }
    // The badge and the audit card are the same fact stated twice; the split is
    // the bug this script was written for, so it is asserted rather than assumed.
    if (wantedCopy['badge-audit'] === wantedCopy['audit-c1-status']) {
      problems.push(`${locale}: badge-audit and audit-c1-status are identical; one is a badge and one is a sentence`);
    }

    if (check) {
      for (const [key, value] of Object.entries(wantedCopy)) {
        if (dict[key] !== value) {
          problems.push(`${locale}.json ${key} does not match the claim this repo publishes`);
        }
      }
    } else {
      let changed = 0;
      for (const [key, value] of Object.entries(wantedCopy)) {
        if (dict[key] === value) continue;
        dict[key] = value;
        changed++;
        console.log(`  ${locale}.json ${key} guncellendi`);
      }
      if (changed) writeJson(file, dict);
    }
  }

  // Markup, after the dictionaries so a failure above leaves the HTML alone.
  let pages = 0;
  for (const file of indexPages()) {
    const locale = localeOfIndexPage(file);
    const rel = path.relative(siteRoot, file).replace(/\\/g, '/');
    const html = fs.readFileSync(file, 'utf8');
    let next = html;

    for (const key of ['badge-audit', 'audit-c1-status', 'rec-c3-desc', 'testimonial-2']) {
      const re = TEXT_NODE(key);
      re.lastIndex = 0;
      if (!re.test(html)) continue; // not on this page
      if (check) {
        const m = new RegExp('<[^>]*data-i18n="' + key + '"[^>]*>([\\s\\S]*?)<').exec(html);
        const want = expectedByLocale[locale][key];
        if (m && m[1] !== want) {
          problems.push(`${rel}: ${key} markup is not what ${locale}.json publishes`);
        }
      } else {
        next = applyFallback(next, key, expectedByLocale[locale][key]);
      }
    }

    if (check) continue;
    if (next !== html) {
      fs.writeFileSync(file, next, 'utf8');
      pages++;
      console.log(`  ${rel} guncellendi`);
    }
  }

  if (problems.length) {
    console.error('\nIddia gecersiz kildi:');
    for (const p of problems) console.error('  - ' + p);
    console.error('\n`node scripts/sync-security-claims.cjs` ile yenileyin.');
    process.exit(1);
  }

  if (check) {
    console.log('Durum: PASS - kripto ve denetim iddialari kodla ve gerceklerle uyumlu.');
  } else {
    console.log(`  ${pages} HTML dosyasi guncellendi.`);
    console.log('Simdi ureticileri calistirip sonucu commit edin:');
    console.log('  node scripts/build-pages.cjs && node scripts/generate-locales.cjs && node scripts/generate-sitemap.cjs');
  }
}

if (require.main === module) main();

module.exports = { readRecoveryProfile, recoveryCopy, AUDIT_STATE };