/* Aligns the phrase SignPath's application state is stated in across all three pages.
 *
 *   node scripts/apply-signpath-status-phrase-i18n.cjs
 *
 * check-signing-copy-agreement.cjs failed on `application-not-submitted`: the
 * download card said "prepared but not submitted" and the Windows platform page
 * said "prepared but not yet submitted", while the policy page said "has not yet
 * been submitted". All three are true and only one matches the check's phrase.
 *
 * The check exists to catch three pages telling a user different things. It is
 * right to have failed here, and the fix is not to loosen the check -- a gate
 * that accepts three phrasings of one fact catches nothing. It is to say the same
 * sentence in the same words everywhere, so that a reader who compares two pages
 * finds no difference to wonder about.
 */
const fs = require('fs');
const path = require('path');

const { apply } = require('./lib/signpath-policy-i18n.cjs');

const I18N_DIR = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');
const CODES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'tr', 'zh'];

/* English, then the equivalents. Only the clause changes; the sentence around it
 * stays as written. */
const DOWNLOAD = {
  en: ['An application to the SignPath Foundation has been prepared but not submitted.', 'An application to the SignPath Foundation <strong>has not yet been submitted</strong>.'],
  tr: ['SignPath Foundation programına başvuru hazırlandı ama henüz gönderilmedi.', 'SignPath Foundation programına başvuru <strong>henüz gönderilmemiştir</strong>.'],
  de: ['Eine Bewerbung beim SignPath Foundation ist vorbereitet, aber noch nicht eingereicht.', 'Eine Bewerbung beim SignPath Foundation <strong>wurde noch nicht eingereicht</strong>.'],
  fr: ['Une candidature auprès de la SignPath Foundation a été préparée mais pas encore déposée.', "Une candidature auprès de la SignPath Foundation <strong>n'a pas encore été déposée</strong>."],
  es: ['al programa de SignPath Foundation pero no se ha enviado.', 'al programa de SignPath Foundation <strong>todavía no se ha enviado</strong>.'],
  it: ['Una domanda alla SignPath Foundation è stata preparata ma non ancora inoltrata.', 'La domanda alla SignPath Foundation <strong>non è ancora stata inoltrata</strong>.'],
  pt: ['Uma candidatura à SignPath Foundation foi preparada mas ainda não submetida.', 'A candidatura à SignPath Foundation <strong>ainda não foi submetida</strong>.'],
  ru: ['Заявка в SignPath Foundation подготовлена, но ещё не подана.', 'Заявка в SignPath Foundation <strong>ещё не подана</strong>.'],
  ar: ['أُعدّ طلب إلى برنامج SignPath Foundation لكنه لم يُقدَّم بعد.', 'طلب التوقيع إلى SignPath Foundation <strong>لم يُقدَّم بعد</strong>.'],
  ja: ['SignPath Foundation への申請は準備済みですが、まだ提出していません。', 'SignPath Foundation への署名は<strong>まだ提出されていません</strong>。'],
  ko: ['SignPath Foundation 신청은 준비됐지만 아직 제출하지 않았습니다.', 'SignPath Foundation 서명 신청은 <strong>아직 제출되지 않았습니다</strong>.'],
  zh: ['已准备好向 SignPath Foundation 提交申请，但尚未提交。', '向 SignPath Foundation 的签名申请<strong>尚未提交</strong>。'],
};

const PLATFORM = {
  en: ['An application to the SignPath Foundation for free open-source signing has been prepared but not yet submitted;', 'An application to the SignPath Foundation for free open-source signing <strong>has not yet been submitted</strong>;'],
  tr: ['İmzalama için SignPath Foundation programına başvuru hazırlandı ama henüz gönderilmedi;', 'İmzalama için SignPath Foundation programına başvuru <strong>henüz gönderilmemiştir</strong>;'],
  de: ['Eine Bewerbung beim SignPath Foundation für kostenlose Open-Source-Signierung ist vorbereitet, aber noch nicht eingereicht;', 'Eine Bewerbung beim SignPath Foundation für kostenlose Open-Source-Signierung <strong>wurde noch nicht eingereicht</strong>;'],
  fr: ["Une candidature auprès de la SignPath Foundation pour la signature open source gratuite a été préparée mais pas encore déposée ;", "Une candidature auprès de la SignPath Foundation pour la signature open source gratuite <strong>n'a pas encore été déposée</strong> ;"],
  es: ['Se ha preparado una solicitud al programa de SignPath Foundation para firma de código abierto gratuita pero aún no se ha enviado;', 'La solicitud al programa de SignPath Foundation para firma de código abierto gratuita <strong>todavía no se ha enviado</strong>;'],
  it: ['Una domanda alla SignPath Foundation per la firma open source gratuita è stata preparata ma non ancora inoltrata;', 'La domanda alla SignPath Foundation per la firma open source gratuita <strong>non è ancora stata inoltrata</strong>;'],
  pt: ['Foi preparada uma candidatura à SignPath Foundation para assinatura de código aberto gratuita, mas ainda não submetida;', 'A candidatura à SignPath Foundation para assinatura de código aberto gratuita <strong>ainda não foi submetida</strong>;'],
  ru: ['Заявка в SignPath Foundation на бесплатную подпись open source подготовлена, но ещё не подана;', 'Заявка в SignPath Foundation на бесплатную подпись open source <strong>ещё не подана</strong>;'],
  ar: ['وأُعدّ طلب إلى برنامج SignPath Foundation للتوقيع المجاني على البرمجيات مفتوحة المصدر، لكنه لم يُقدَّم بعد؛', 'وأُعدّ طلب إلى برنامج SignPath Foundation للتوقيع المجاني على البرمجيات مفتوحة المصدر، <strong>لم يُقدَّم بعد</strong>؛'],  ja: ['オープンソース向けの無料署名について SignPath Foundation への申請は準備済みですが、まだ提出していません。', 'オープンソース向けの無料署名について SignPath Foundation への申請は<strong>まだ提出されていません</strong>。'],
  ko: ['오픈소스 무료 서명을 위한 SignPath Foundation 신청은 준비됐지만 아직 제출하지 않았으며,', '오픈소스 무료 서명을 위한 SignPath Foundation 신청은 <strong>아직 제출되지 않았으며</strong>,'],
  zh: ['已准备好向 SignPath Foundation 申请免费的开源代码签名，但尚未提交；', '向 SignPath Foundation 申请免费的开源代码签名<strong>尚未提交</strong>；'],
};

let changed = 0;
const problems = [];

for (const [key, table] of [['win-store-desc', DOWNLOAD], ['p-windows-sec-body', PLATFORM]]) {
  for (const code of CODES) {
    const [from, to] = table[code];
    const file = path.join(I18N_DIR, code + '.json');
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    const value = json[key];

    if (typeof value !== 'string' || !value.includes(from)) {
      problems.push(`${code} ${key}: clause not found verbatim`);
      continue;
    }
    if (value.includes(to)) continue;

    json[key] = value.replace(from, to);
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
    changed++;
  }
}

console.log(`aligned ${changed} value(s) across ${CODES.length} locales`);
if (problems.length) {
  problems.forEach((p) => console.log('  ' + p));
  process.exitCode = 1;
}
