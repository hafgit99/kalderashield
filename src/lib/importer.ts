/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultCustomField, VaultItem } from '../types';

import { parseCSV } from './csvParser';
import { defaultImportLabels } from './importerLabels';
import { parseGoogleAuthenticatorMigrationUri } from './otpMigration';

export { parseCSV } from './csvParser';

export type ImportResult = 
  | { type: 'success'; items: Partial<VaultItem>[]; formatName: string }
  | { type: 'encrypted_KalderaShield'; envelope: Record<string, unknown> }
  | { type: 'error'; message: string };

export interface ImportLabels {
  errorEmpty: string;
  formatKalderaShieldJson: string;
  formatBitwardenJson: string;
  errorUnsupportedJson: string;
  errorJsonPrefix: string;
  errorCsvHeader: string;
  formatBitwardenCsv: string;
  formatLastPassCsv: string;
  formatChromeCsv: string;
  formatOnePasswordCsv: string;
  untitledUniversal: string;
  formatUniversalCsv: string;
  errorCsvColumns: string;
}

function normalizeImportString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeOptionalImportString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Builds a non-empty human-readable title for an imported vault item.
 *
 * Many CSV exports (and a few sloppy JSON exports) ship rows with an empty
 * title cell. The vault schema requires every item to have a title or a
 * username, so a "İsimsiz Aktarım" / "Untitled Import" placeholder is
 * unavoidable when the row really has no identifying data. To keep the
 * fallback as informative as possible we prefer, in order:
 *
 *   1. the explicit `titleCandidate` argument (e.g. the row's own title
 *      cell, trimmed)
 *   2. the row's `username` value (e.g. an email or login name)
 *   3. the row's `url` host (e.g. "github.com" for a row with no name)
 *   4. the row's `notes` first line as a last-ditch descriptive label
 *   5. the localized `untitledFallback` (İsimsiz Aktarım / Untitled Import)
 *
 * Returning a non-empty string is guaranteed; the placeholder is only
 * used when every other source is empty.
 */
function buildImportedTitle(
  titleCandidate: string | undefined,
  username: string | undefined,
  url: string | undefined,
  notes: string | undefined,
  untitledFallback: string,
): string {
  if (titleCandidate && titleCandidate.trim().length > 0) {
    return titleCandidate.trim();
  }
  if (username && username.trim().length > 0) {
    return username.trim();
  }
  if (url && url.trim().length > 0) {
    try {
      // Trim trailing slashes, paths, and ports so the title stays short.
      const parsed = new URL(url.trim().includes('://') ? url.trim() : `https://${url.trim()}`);
      const host = parsed.hostname.replace(/^www\./i, '');
      if (host) return host;
    } catch {
      const stripped = url.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];
      if (stripped) return stripped;
    }
  }
  if (notes && notes.trim().length > 0) {
    const firstLine = notes.trim().split(/\r?\n/)[0]?.trim();
    if (firstLine && firstLine.length > 0 && firstLine.length <= 60) return firstLine;
  }
  return untitledFallback;
}


function decodeXmlEntities(text: string): string {
  return text.replace(/&(lt|gt|quot|apos|amp|#x[0-9a-fA-F]+|#\d+);/g, (match, entity: string) => {
    switch (entity) {
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
      case 'amp':
        return '&';
      default: {
        if (entity.startsWith('#x') || entity.startsWith('#X')) {
          const code = Number.parseInt(entity.slice(2), 16);
          return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
            ? String.fromCodePoint(code)
            : match;
        }
        if (entity.startsWith('#')) {
          const code = Number.parseInt(entity.slice(1), 10);
          return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
            ? String.fromCodePoint(code)
            : match;
        }
        return match;
      }
    }
  });
}

function parseKeePassXml(xml: string, untitledFallback: string): Partial<VaultItem>[] {
  const items: Partial<VaultItem>[] = [];
  // Strip <History> blocks so historical versions are not imported as duplicate entries.
  const withoutHistory = xml.replace(/<History>[\s\S]*?<\/History>/gi, '');
  const entryRegex = /<Entry\b[^>]*>([\s\S]*?)<\/Entry>/gi;
  const stringPairRegex = /<String\b[^>]*>\s*<Key>([\s\S]*?)<\/Key>\s*<Value(?:\s+[^>]*)?>([\s\S]*?)<\/Value>\s*<\/String>/gi;

  let entryMatch: RegExpExecArray | null;
  while ((entryMatch = entryRegex.exec(withoutHistory)) !== null) {
    const body = entryMatch[1] || '';
    const fields = new Map<string, string>();
    const protectedKeys = new Set<string>();

    let pairMatch: RegExpExecArray | null;
    stringPairRegex.lastIndex = 0;
    while ((pairMatch = stringPairRegex.exec(body)) !== null) {
      const fullTag = pairMatch[0];
      const key = decodeXmlEntities((pairMatch[1] || '').trim());
      const value = decodeXmlEntities((pairMatch[2] || '').trim());
      if (!key) continue;
      fields.set(key, value);
      if (/ProtectInMemory\s*=\s*"True"/i.test(fullTag)) {
        protectedKeys.add(key);
      }
    }

    const rawTitle = fields.get('Title') || '';
    const username = fields.get('UserName') || '';
    const password = fields.get('Password') || '';
    const url = fields.get('URL') || '';
    const notes = fields.get('Notes') || '';
    const totpSecret = fields.get('otp') || fields.get('TOTP Seed') || fields.get('TimeOtp-Secret-Base32') || '';

    const standardKeys = new Set(['Title', 'UserName', 'Password', 'URL', 'Notes', 'otp', 'TOTP Seed', 'TimeOtp-Secret-Base32']);
    const customFields: VaultCustomField[] = [];
    for (const [k, v] of fields.entries()) {
      if (standardKeys.has(k) || !v) continue;
      customFields.push({
        id: `kp-${customFields.length + 1}`,
        label: k,
        value: v,
        type: protectedKeys.has(k) ? 'hidden' : 'text',
      });
    }

    if (!rawTitle && !username && !password && !url && !notes && !totpSecret) continue;

    items.push({
      title: buildImportedTitle(rawTitle, username, url, notes, untitledFallback),
      username,
      password,
      url,
      notes,
      totpSecret,
      category: 'login',
      ...(customFields.length > 0 ? { customFields } : {}),
    });
  }
  return items;
}

/**
 * Parses any password manager export/backup and returns a normalized unified list.
 */
export function parseUniversalImport(fileContent: string, labels: Partial<ImportLabels> = {}): ImportResult {
  const copy = { ...defaultImportLabels, ...labels };
  const trimmed = fileContent.trim();
  if (!trimmed) {
    return { type: 'error', message: copy.errorEmpty };
  }

  // Scenario 0: Google Authenticator otpauth-migration:// URI (single or multi-line export)
  if (/^otpauth-migration:\/\//i.test(trimmed)) {
    const migrated: Partial<VaultItem>[] = [];
    for (const line of trimmed.split(/\r?\n/)) {
      const candidate = line.trim();
      if (!candidate.toLowerCase().startsWith('otpauth-migration://')) continue;
      for (const acc of parseGoogleAuthenticatorMigrationUri(candidate)) {
        migrated.push({
          title: acc.issuer ? `${acc.issuer} (${acc.name})` : acc.name,
          username: acc.name,
          password: '',
          url: acc.issuer && acc.issuer.includes('.') ? `https://${acc.issuer}` : '',
          totpSecret: acc.otpauthUri,
          category: 'login',
        });
      }
    }
    if (migrated.length > 0) {
      return { type: 'success', items: migrated, formatName: 'Google Authenticator (otpauth-migration)' };
    }
  }

  // Scenario 0b: KeePass 2.x XML Export
  if (/^<\?xml|^<KeePassFile/i.test(trimmed) && /<KeePassFile/i.test(trimmed)) {
    const items = parseKeePassXml(trimmed, copy.untitledUniversal);
    if (items.length > 0) {
      return { type: 'success', items, formatName: 'KeePass 2.x (XML)' };
    }
  }

  // Scenario A: JSON Format
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);

      // 1. Encrypted KalderaShield Backup File
      if ((parsed.version === "1.1" || parsed.kdf === "Argon2id" || parsed.encrypted) && parsed.salt && parsed.payload) {
        return { type: 'encrypted_KalderaShield', envelope: parsed };
      }

      // 2. Multi-record KalderaShield JSON array
      if (Array.isArray(parsed)) {
        // Double check if typical KalderaShield JSON format
        const items: Partial<VaultItem>[] = parsed.map(x => {
          const username = normalizeImportString(x.username);
          const url = normalizeImportString(x.url);
          const notes = normalizeImportString(x.notes);
          return {
            title: buildImportedTitle(normalizeImportString(x.title, ''), username, url, notes, copy.untitledUniversal),
            username,
            password: normalizeImportString(x.password),
            url,
            ...(Array.isArray(x.additionalUrls) ? { additionalUrls: x.additionalUrls.filter((u: unknown): u is string => typeof u === 'string' && u.trim().length > 0) } : {}),
            ...(Array.isArray(x.customFields) ? { customFields: x.customFields } : {}),
            ...(Array.isArray(x.totpRecoveryCodes) ? { totpRecoveryCodes: x.totpRecoveryCodes.filter((c: unknown): c is string => typeof c === 'string') } : {}),
            notes,
            totpSecret: normalizeImportString(x.totpSecret),
            category: normalizeImportString(x.category, 'login') as Partial<VaultItem>['category'],
            favorite: !!x.favorite,
            cardholderName: normalizeOptionalImportString(x.cardholderName),
            cardNumber: normalizeOptionalImportString(x.cardNumber),
            cardExpiry: normalizeOptionalImportString(x.cardExpiry),
            cardCvv: normalizeOptionalImportString(x.cardCvv),
            cardPin: normalizeOptionalImportString(x.cardPin),
            idNumber: normalizeOptionalImportString(x.idNumber),
            idFullName: normalizeOptionalImportString(x.idFullName),
            idBirthDate: normalizeOptionalImportString(x.idBirthDate),
            idExpiryDate: normalizeOptionalImportString(x.idExpiryDate),
            idGender: normalizeOptionalImportString(x.idGender),
            passkeyService: normalizeOptionalImportString(x.passkeyService),
            passkeyPrivateExponent: normalizeOptionalImportString(x.passkeyPrivateExponent),
            passkeyPublicId: normalizeOptionalImportString(x.passkeyPublicId),
          };
        });
        return { type: 'success', items, formatName: copy.formatKalderaShieldJson };
      }

      // 3. Bitwarden JSON structure
      if (parsed.items && Array.isArray(parsed.items)) {
        const items: Partial<VaultItem>[] = [];
        parsed.items.forEach((bwRaw: unknown) => {
          const bw = bwRaw as Record<string, unknown> & {
            name?: string;
            type?: number;
            notes?: string;
            favorite?: boolean;
            fields?: { name?: string; value?: string; type?: number }[];
            passwordHistory?: { password?: string; lastUsedDate?: string }[];
            login?: { username?: string; password?: string; uris?: { uri?: string }[]; totp?: string };
            card?: { cardholderName?: string; number?: string; code?: string; expMonth?: string; expYear?: string };
            identity?: { firstName?: string; lastName?: string; ssn?: string; passportNumber?: string };
          };
          // First pass: discover the row's identifying fields so we can
          // synthesise a non-empty title if `bw.name` is missing.
          const allUris = (bw.type === 1 && Array.isArray(bw.login?.uris))
            ? bw.login.uris.map((u) => (typeof u?.uri === 'string' ? u.uri.trim() : '')).filter(Boolean)
            : [];
          const username = (bw.type === 1 && bw.login?.username) || '';
          const url = allUris[0] || '';
          const additionalUrls = allUris.slice(1);
          const cardholderName = (bw.type === 3 && bw.card?.cardholderName) || '';
          const idFullName = (bw.type === 4 && bw.identity)
            ? `${bw.identity.firstName || ''} ${bw.identity.lastName || ''}`.trim()
            : '';
          const notes = bw.notes || '';

          // Choose the most informative title candidate: explicit name →
          // cardholder name → identity name → username → url host.
          const titleCandidate = bw.name || cardholderName || idFullName || username || url;

          const customFields: VaultCustomField[] = Array.isArray(bw.fields)
            ? bw.fields
              .filter((f) => typeof f?.name === 'string' && f.name.trim().length > 0)
              .map((f, idx) => ({
                id: `bw-field-${idx + 1}`,
                label: f.name!.trim(),
                value: typeof f.value === 'string' ? f.value : '',
                type: f.type === 1 ? 'hidden' : 'text',
              }))
            : [];

          const passwordHistory = Array.isArray(bw.passwordHistory)
            ? bw.passwordHistory
              .filter((h) => typeof h?.password === 'string' && h.password.length > 0)
              .map((h) => ({
                password: h.password!,
                changedAt: typeof h.lastUsedDate === 'string' && h.lastUsedDate ? h.lastUsedDate : new Date().toISOString(),
              }))
            : [];

          const item: Partial<VaultItem> = {
            title: buildImportedTitle(titleCandidate, username, url, notes, copy.untitledUniversal),
            notes,
            favorite: !!bw.favorite,
            ...(additionalUrls.length > 0 ? { additionalUrls } : {}),
            ...(customFields.length > 0 ? { customFields } : {}),
            ...(passwordHistory.length > 0 ? { passwordHistory } : {}),
          };

          // Bitwarden Types: 1=Login, 2=SecureNote, 3=Card, 4=Identity
          if (bw.type === 1) {
            item.category = 'login';
            if (bw.login) {
              item.username = username;
              item.password = bw.login.password || '';
              item.url = url;
              item.totpSecret = bw.login.totp || '';
            }
          } else if (bw.type === 2) {
            item.category = 'secure_note';
          } else if (bw.type === 3) {
            item.category = 'card';
            if (bw.card) {
              item.cardholderName = cardholderName;
              item.cardNumber = bw.card.number || '';
              item.cardCvv = bw.card.code || '';
              item.cardPin = '';
              const m = bw.card.expMonth || '';
              const y = bw.card.expYear || '';
              item.cardExpiry = m && y ? `${m}/${y.toString().slice(-2)}` : '';
            }
          } else if (bw.type === 4) {
            item.category = 'identity';
            if (bw.identity) {
              item.idFullName = idFullName;
              item.idNumber = bw.identity.ssn || bw.identity.passportNumber || '';
              item.idGender = '';
            }
          } else {
            item.category = 'login';
          }

          items.push(item);
        });

        return { type: 'success', items, formatName: copy.formatBitwardenJson };
      }

      // 4. Proton Pass JSON structure ({ vaults: { [id]: { items: [...] } } })
      if (parsed.vaults && typeof parsed.vaults === 'object' && !Array.isArray(parsed.vaults)) {
        const items: Partial<VaultItem>[] = [];
        for (const vaultObj of Object.values(parsed.vaults as Record<string, unknown>)) {
          const vault = vaultObj as { items?: unknown[] };
          if (!Array.isArray(vault?.items)) continue;
          for (const rawEntry of vault.items) {
            const entry = rawEntry as {
              data?: {
                type?: string;
                metadata?: { name?: string; note?: string };
                content?: {
                  itemEmail?: string;
                  itemUsername?: string;
                  email?: string;
                  username?: string;
                  password?: string;
                  urls?: string[];
                  totpUri?: string;
                  cardholderName?: string;
                  number?: string;
                  expirationDate?: string;
                  verificationNumber?: string;
                };
                extraFields?: { fieldName?: string; type?: string; data?: { content?: string } }[];
              };
            };
            const data = entry?.data;
            if (!data) continue;
            const content = data.content || {};
            const urls = Array.isArray(content.urls) ? content.urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0) : [];
            const username = content.itemUsername || content.itemEmail || content.username || content.email || '';
            const notes = data.metadata?.note || '';
            const rawTitle = data.metadata?.name || '';
            const customFields: VaultCustomField[] = Array.isArray(data.extraFields)
              ? data.extraFields
                .filter((f) => typeof f?.fieldName === 'string' && f.fieldName.trim().length > 0)
                .map((f, idx) => ({
                  id: `pp-${idx + 1}`,
                  label: f.fieldName!.trim(),
                  value: f.data?.content || '',
                  type: f.type === 'hidden' ? 'hidden' : 'text',
                }))
              : [];

            if (data.type === 'creditCard') {
              items.push({
                title: buildImportedTitle(rawTitle, content.cardholderName, '', notes, copy.untitledUniversal),
                category: 'card',
                cardholderName: content.cardholderName || '',
                cardNumber: content.number || '',
                cardExpiry: content.expirationDate || '',
                cardCvv: content.verificationNumber || '',
                notes,
              });
            } else if (data.type === 'note') {
              items.push({
                title: buildImportedTitle(rawTitle, '', '', notes, copy.untitledUniversal),
                category: 'secure_note',
                notes,
              });
            } else {
              items.push({
                title: buildImportedTitle(rawTitle, username, urls[0], notes, copy.untitledUniversal),
                category: 'login',
                username,
                password: content.password || '',
                url: urls[0] || '',
                ...(urls.length > 1 ? { additionalUrls: urls.slice(1) } : {}),
                totpSecret: content.totpUri || '',
                notes,
                ...(customFields.length > 0 ? { customFields } : {}),
              });
            }
          }
        }
        if (items.length > 0) {
          return { type: 'success', items, formatName: 'Proton Pass (JSON)' };
        }
      }

      // Fallback general JSON structure
      return { type: 'error', message: copy.errorUnsupportedJson };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || '');
      return { type: 'error', message: `${copy.errorJsonPrefix}: ${msg}` };
    }
  }

  // Scenario B: CSV Format
  const rows = parseCSV(trimmed);
  const firstRow = rows[0];
  if (rows.length < 2 || !firstRow) {
    return { type: 'error', message: copy.errorCsvHeader };
  }

  const headers = firstRow.map(h => h.toLowerCase().trim().replace(/^["']|["']$/g, ''));
  const dataRows = rows.slice(1);

  // Helper to locate column index by aliases.
  // Matching priority (most specific first) to avoid false positives like
  // "username" matching the "name" title alias or "uri" matching "url":
  //   1. exact match (case-insensitive)
  //   2. word-boundary match (e.g. "User Name" matches alias "name")
  // Substring fallback is intentionally NOT used because short aliases
  // like "name", "url", "pass" would otherwise match the middle of
  // unrelated headers ("username", "uri", "password"). For non-Latin
  // headers we rely on the i18n CSV fallback to fail gracefully with a
  // localised "no recognised columns" error rather than mis-match.
  const findColumnIndex = (aliases: string[]): number => {
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());
    const normalizedAliases = aliases.map(a => a.toLowerCase());

    // 1. Exact match
    for (const alias of normalizedAliases) {
      const idx = normalizedHeaders.indexOf(alias);
      if (idx !== -1) return idx;
    }

    // 2. Word-boundary match: split header on non-alphanumeric chars and
    //    compare whole tokens. This finds "User Name" → "name" while
    //    rejecting "username" → "name".
    const splitTokens = (value: string) => value.split(/[^a-z0-9\u00C0-\u017F]+/i).filter(Boolean);
    for (const alias of normalizedAliases) {
      const idx = normalizedHeaders.findIndex(h => splitTokens(h).includes(alias));
      if (idx !== -1) return idx;
    }

    return -1;
  };

  // 1. Bitwarden CSV detection: "folder,favorite,type,name,notes,fields,login_uri,login_username,login_password,login_totp"
  if (headers.includes('login_password') || headers.includes('login_username')) {
    const nameIdx = findColumnIndex(['name', 'title']);
    const userIdx = findColumnIndex(['login_username', 'username']);
    const passIdx = findColumnIndex(['login_password', 'password']);
    const uriIdx = findColumnIndex(['login_uri', 'uri', 'url']);
    const totpIdx = findColumnIndex(['login_totp', 'totp', 'otp']);
    const notesIdx = findColumnIndex(['notes']);
    const favIdx = findColumnIndex(['favorite']);
    const typeIdx = findColumnIndex(['type']); // Login, Note, Card, Identity

    const items: Partial<VaultItem>[] = dataRows.map(row => {
      // Always materialise a non-empty title so that an empty source cell
      // does not cascade into a downstream "itemMissingRequiredFields"
      // rejection that would surface as "Yedek dosyasının içi liste
      // yapısında değil". When the title cell is empty we fall back to
      // the username, then the url host, then the notes first line, and
      // finally to the localized "İsimsiz Aktarım" placeholder.
      const rawTitle = nameIdx !== -1 ? row[nameIdx] : '';
      const username = (userIdx !== -1 ? row[userIdx] : '') || '';
      const url = (uriIdx !== -1 ? row[uriIdx] : '') || '';
      const notes = (notesIdx !== -1 ? row[notesIdx] : '') || '';
      const title = buildImportedTitle(rawTitle, username, url, notes, copy.untitledUniversal);

      // Map Bitwarden type strings/ids to local categories.
      const typeCell = typeIdx !== -1 ? row[typeIdx] : 'login';
      const typeStr = (typeCell ?? 'login').toLowerCase();
      let category: 'login' | 'card' | 'identity' | 'secure_note' = 'login';
      if (typeStr.includes('note') || typeStr === '2') category = 'secure_note';
      else if (typeStr.includes('card') || typeStr === '3') category = 'card';
      else if (typeStr.includes('identity') || typeStr === '4') category = 'identity';

      return {
        title,
        username,
        password: (passIdx !== -1 ? row[passIdx] : '') || '',
        url,
        totpSecret: (totpIdx !== -1 ? row[totpIdx] : '') || '',
        notes,
        favorite: favIdx !== -1 ? row[favIdx] === 'true' || row[favIdx] === '1' : false,
        category,
      };
    });

    return { type: 'success', items, formatName: copy.formatBitwardenCsv };
  }

  // 2. LastPass CSV detection: "url,username,password,extra,name,grouping,fav"
  if (headers.includes('grouping') && headers.includes('extra')) {
    const urlIdx = findColumnIndex(['url']);
    const userIdx = findColumnIndex(['username', 'user']);
    const passIdx = findColumnIndex(['password']);
    const extraIdx = findColumnIndex(['extra', 'notes']);
    const nameIdx = findColumnIndex(['name', 'title']);
    const favIdx = findColumnIndex(['fav', 'favorite']);

    const items: Partial<VaultItem>[] = dataRows.map(row => {
      // Always materialise a non-empty title so an empty source cell does
      // not cascade into a downstream "itemMissingRequiredFields" error
      // that would surface as "Yedek dosyasının içi liste yapısında değil".
      const rawTitle = nameIdx !== -1 ? row[nameIdx] : '';
      const username = (userIdx !== -1 ? row[userIdx] : '') || '';
      const url = (urlIdx !== -1 ? row[urlIdx] : '') || '';
      const notes = (extraIdx !== -1 ? row[extraIdx] : '') || '';
      const title = buildImportedTitle(rawTitle, username, url, notes, copy.untitledUniversal);
      return {
        title,
        username,
        password: (passIdx !== -1 ? row[passIdx] : '') || '',
        url,
        notes,
        favorite: favIdx !== -1 ? row[favIdx] === '1' || row[favIdx] === 'true' : false,
        category: 'login',
      };
    });

    return { type: 'success', items, formatName: copy.formatLastPassCsv };
  }

  // 2b. Firefox CSV detection: "url,username,password,httpRealm,formActionOrigin,guid,..."
  if (headers.includes('httprealm') || headers.includes('formactionorigin')) {
    const urlIdx = findColumnIndex(['url']);
    const userIdx = findColumnIndex(['username']);
    const passIdx = findColumnIndex(['password']);
    const items: Partial<VaultItem>[] = dataRows.map((row) => {
      const url = (urlIdx !== -1 ? row[urlIdx] : '') || '';
      const username = (userIdx !== -1 ? row[userIdx] : '') || '';
      return {
        title: buildImportedTitle('', username, url, '', copy.untitledUniversal),
        username,
        password: (passIdx !== -1 ? row[passIdx] : '') || '',
        url,
        category: 'login',
      };
    });
    return { type: 'success', items, formatName: 'Mozilla Firefox (CSV)' };
  }

  // 2c. Apple Passwords / Safari CSV detection: "title,url,username,password,notes,otpauth"
  if (headers.includes('otpauth') && headers.includes('title') && headers.includes('password')) {
    const titleIdx = findColumnIndex(['title']);
    const urlIdx = findColumnIndex(['url']);
    const userIdx = findColumnIndex(['username']);
    const passIdx = findColumnIndex(['password']);
    const notesIdx = findColumnIndex(['notes']);
    const otpIdx = findColumnIndex(['otpauth']);
    const items: Partial<VaultItem>[] = dataRows.map((row) => {
      const rawTitle = titleIdx !== -1 ? row[titleIdx] : '';
      const username = (userIdx !== -1 ? row[userIdx] : '') || '';
      const url = (urlIdx !== -1 ? row[urlIdx] : '') || '';
      const notes = (notesIdx !== -1 ? row[notesIdx] : '') || '';
      return {
        title: buildImportedTitle(rawTitle, username, url, notes, copy.untitledUniversal),
        username,
        password: (passIdx !== -1 ? row[passIdx] : '') || '',
        url,
        notes,
        totpSecret: (otpIdx !== -1 ? row[otpIdx] : '') || '',
        category: 'login',
      };
    });
    return { type: 'success', items, formatName: 'Apple Passwords / Safari (CSV)' };
  }

  // 2d. Proton Pass CSV detection: "name,url,email,username,password,note,totp,vault"
  if (
    headers.includes('totp')
    && headers.includes('name')
    && headers.includes('password')
    && (headers.includes('email') || headers.includes('vault'))
  ) {
    const nameIdx = findColumnIndex(['name']);
    const urlIdx = findColumnIndex(['url']);
    const emailIdx = findColumnIndex(['email']);
    const userIdx = findColumnIndex(['username']);
    const passIdx = findColumnIndex(['password']);
    const noteIdx = findColumnIndex(['note', 'notes']);
    const totpIdx = findColumnIndex(['totp']);
    const items: Partial<VaultItem>[] = dataRows.map((row) => {
      const rawTitle = nameIdx !== -1 ? row[nameIdx] : '';
      const username = (userIdx !== -1 ? row[userIdx] : '') || (emailIdx !== -1 ? row[emailIdx] : '') || '';
      const url = (urlIdx !== -1 ? row[urlIdx] : '') || '';
      const notes = (noteIdx !== -1 ? row[noteIdx] : '') || '';
      return {
        title: buildImportedTitle(rawTitle, username, url, notes, copy.untitledUniversal),
        username,
        password: (passIdx !== -1 ? row[passIdx] : '') || '',
        url,
        notes,
        totpSecret: (totpIdx !== -1 ? row[totpIdx] : '') || '',
        category: 'login',
      };
    });
    return { type: 'success', items, formatName: 'Proton Pass (CSV)' };
  }

  // 3. Google Password Manager CSV detection: "name,url,username,password,note"
  if (headers.includes('name') && headers.includes('url') && headers.includes('username') && headers.includes('password')) {
    const nameIdx = findColumnIndex(['name']);
    const urlIdx = findColumnIndex(['url']);
    const userIdx = findColumnIndex(['username']);
    const passIdx = findColumnIndex(['password']);
    const noteIdx = findColumnIndex(['note', 'notes']);

    const items: Partial<VaultItem>[] = dataRows.map(row => {
      // Always materialise a non-empty title so an empty source cell does
      // not cascade into a downstream "itemMissingRequiredFields" error
      // that would surface as "Yedek dosyasının içi liste yapısında değil".
      const rawTitle = nameIdx !== -1 ? row[nameIdx] : '';
      const username = (userIdx !== -1 ? row[userIdx] : '') || '';
      const url = (urlIdx !== -1 ? row[urlIdx] : '') || '';
      const notes = (noteIdx !== -1 ? row[noteIdx] : '') || '';
      const title = buildImportedTitle(rawTitle, username, url, notes, copy.untitledUniversal);
      return {
        title,
        username,
        password: (passIdx !== -1 ? row[passIdx] : '') || '',
        url,
        notes,
        category: 'login',
      };
    });

    return { type: 'success', items, formatName: copy.formatChromeCsv };
  }

  // 4. 1Password CSV detection: "title,website,username,password,notes,etc" or "title,url,username,password"
  if (headers.includes('title') && (headers.includes('website') || headers.includes('url')) && headers.includes('password')) {
    const titleIdx = findColumnIndex(['title']);
    const webIdx = findColumnIndex(['website', 'url', 'uri']);
    const userIdx = findColumnIndex(['username']);
    const passIdx = findColumnIndex(['password']);
    const notesIdx = findColumnIndex(['notes']);

    const items: Partial<VaultItem>[] = dataRows.map(row => {
      const rawTitle = titleIdx !== -1 ? row[titleIdx] : '';
      const username = (userIdx !== -1 ? row[userIdx] : '') || '';
      const url = (webIdx !== -1 ? row[webIdx] : '') || '';
      const notes = (notesIdx !== -1 ? row[notesIdx] : '') || '';
      const title = buildImportedTitle(rawTitle, username, url, notes, copy.untitledUniversal);
      return {
        title,
        username,
        password: (passIdx !== -1 ? row[passIdx] : '') || '',
        url,
        notes,
        category: 'login',
      };
    });

    return { type: 'success', items, formatName: copy.formatOnePasswordCsv };
  }

  // 5. Universal CSV Fallback mapper (Detect columns based on synonyms)
  const titleIdx = findColumnIndex(['title', 'name', 'label', 'app', 'site', 'service']);
  const userIdx = findColumnIndex(['username', 'user', 'login', 'email', 'e-posta', 'e_posta']);
  const passIdx = findColumnIndex(['password', 'pass', 'pwd', '\u015fifre', 'sifre', 'parola']);
  const urlIdx = findColumnIndex(['url', 'website', 'link', 'uri']);
  const notesIdx = findColumnIndex(['notes', 'note', 'desc', 'description', 'not', 'notlar', 'extra']);
  const totpIdx = findColumnIndex(['totp', 'secret', 'key', 'otp', '2fa', 'authenticator']);

  if (titleIdx !== -1 || userIdx !== -1 || passIdx !== -1) {
    // Always materialise a non-empty title slot so a CSV row with an empty
    // title cell plus an empty username cell does not get rejected by the
    // downstream "item must have title or username" schema check. The
    // buildImportedTitle helper falls through username -> url host ->
    // notes first line before defaulting to the localized
    // "İsimsiz Aktarım" placeholder.
    const items: Partial<VaultItem>[] = dataRows.map(row => {
      const rawTitle = titleIdx !== -1 ? row[titleIdx] : '';
      const username = userIdx !== -1 ? row[userIdx] : '';
      const url = urlIdx !== -1 ? row[urlIdx] : '';
      const notes = notesIdx !== -1 ? row[notesIdx] : '';
      const title = buildImportedTitle(rawTitle, username, url, notes, copy.untitledUniversal);
      return {
        title,
        username: username || '',
        password: passIdx !== -1 ? row[passIdx] : '',
        url: url || '',
        notes: notes || '',
        totpSecret: totpIdx !== -1 ? row[totpIdx] : '',
        category: 'login',
      };
    });

    return { type: 'success', items, formatName: copy.formatUniversalCsv };
  }

  return { type: 'error', message: copy.errorCsvColumns };
}

export { decodeFileBuffer } from './fileDecoder';
