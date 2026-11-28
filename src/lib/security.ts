/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem, GeneratorOptions, AuditReport } from '../types';
import { secureRandomIndex } from './random';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnTrPackage from '@zxcvbn-ts/language-tr';
import { registerOnCloseSession } from './vaultSession';

const options = {
  translations: zxcvbnTrPackage.translations,
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnTrPackage.dictionary,
  },
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
};

const zxcvbnFactory = new ZxcvbnFactory(options);

export function zxcvbn(password: string) {
  return zxcvbnFactory.check(password);
}

/**
 * In-memory score cache: avoids re-running zxcvbn for the same password string.
 * Bounded to MAX_SCORE_CACHE_SIZE entries to prevent unbounded memory growth.
 * Cache keys are hashed to avoid storing plaintext passwords in memory.
 */
const MAX_SCORE_CACHE_SIZE = 2000;
const passwordScoreCache = new Map<string, number>();

registerOnCloseSession(() => {
  passwordScoreCache.clear();
});

/**
 * Fast synchronous hash for cache keys. Not cryptographic — used only to avoid
 * storing plaintext passwords as Map keys during the active session.
 * Uses FNV-1a inspired mixing with a wider avalanche pass.
 */
function hashCacheKey(password: string): string {
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0x01000193 >>> 0;
  for (let i = 0; i < password.length; i++) {
    const c = password.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x1b873593) >>> 0;
  }
  // Finalisation avalanche
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b) >>> 0;
  h2 ^= h2 >>> 13;
  h2 = Math.imul(h2, 0xc2b2ae35) >>> 0;
  return `${h1.toString(36)}_${h2.toString(36)}_${password.length}`;
}

function getCachedOrComputeScore(password: string): number {
  if (!password) return 0;
  const cacheKey = hashCacheKey(password);
  const cached = passwordScoreCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const result = zxcvbn(password);
  const baseScore = (result.score / 4) * 100;
  const lengthBonus = password.length >= 20 ? 8 : password.length >= 16 ? 4 : 0;
  const shortPenalty = password.length < 12 ? 20 : 0;
  const score = Math.max(0, Math.min(100, Math.round(baseScore + lengthBonus - shortPenalty)));

  // Evict oldest entries if cache is full
  if (passwordScoreCache.size >= MAX_SCORE_CACHE_SIZE) {
    const firstKey = passwordScoreCache.keys().next().value;
    if (firstKey !== undefined) passwordScoreCache.delete(firstKey);
  }
  passwordScoreCache.set(cacheKey, score);
  return score;
}

/**
 * Fast heuristic-based password score that does NOT call zxcvbn.
 * Used for bulk operations (large vaults) where zxcvbn would block the main thread.
 */
function fastPasswordScore(password: string): number {
  if (!password) return 0;

  let score = 0;
  const len = password.length;

  // Length scoring (major factor)
  if (len >= 20) score += 45;
  else if (len >= 16) score += 38;
  else if (len >= 12) score += 34;
  else if (len >= 8) score += 20;
  else score += 5;

  // Character class diversity
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const classCount = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;

  score += classCount * 12;

  // Penalize passwords with only one character class (very weak brute-force resistance)
  if (classCount <= 1) {
    score -= 15;
  }

  // Penalize very short passwords
  if (len < 8) score -= 20;
  if (len < 6) score -= 15;

  // Bonus for no repeating patterns
  const uniqueChars = new Set(password).size;
  const uniqueRatio = uniqueChars / len;
  if (uniqueRatio > 0.7) score += 8;
  else if (uniqueRatio < 0.3) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Calculates security score for a single password from 0 to 100.
 * Uses cached zxcvbn results to avoid redundant computations.
 */
export function calculatePasswordScore(password: string): number {
  return getCachedOrComputeScore(password);
}

/**
 * Categorizes a password according to its strength score.
 * Uses cached zxcvbn calculatePasswordScore for consistent scoring across the application.
 */
export function getStrengthLabel(password: string): {
  label: 'WEAK' | 'MEDIUM' | 'STRONG' | 'SECURE';
  colorClass: string;
} {
  if (!password || password.length < 8) {
    return { label: 'WEAK', colorClass: 'bg-brand-error/20 text-brand-error' };
  }

  const score = calculatePasswordScore(password);
  if (score >= 90) {
    return { label: 'SECURE', colorClass: 'bg-brand-tertiary/20 text-brand-tertiary border border-brand-tertiary/20' };
  } else if (score >= 70) {
    return { label: 'STRONG', colorClass: 'bg-brand-secondary/20 text-brand-secondary border border-brand-secondary/10' };
  } else if (score >= 40) {
    return { label: 'MEDIUM', colorClass: 'bg-amber-500/20 text-amber-300' };
  } else {
    return { label: 'WEAK', colorClass: 'bg-brand-error/20 text-brand-error' };
  }
}

export const AUDIT_EXCELLENT_THRESHOLD = 85;
export const AUDIT_CRITICAL_THRESHOLD = 50;
export const PASSWORD_SECURE_SCORE_THRESHOLD = 85;
export const PASSWORD_WEAK_SCORE_THRESHOLD = 40;
export const PASSWORD_OLD_AGE_DAYS = 90;

const COMMON_2FA_DOMAINS = [
  'github.com',
  'google.com',
  'microsoft.com',
  'live.com',
  'outlook.com',
  'apple.com',
  'icloud.com',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'gitlab.com',
  'bitbucket.org',
  'amazon.com',
  'aws.amazon.com',
  'dropbox.com',
  'proton.me',
  'protonmail.com',
  'tuta.com',
  'fastmail.com',
  'binance.com',
  'coinbase.com',
  'kraken.com',
  'paypal.com',
  'stripe.com',
  'discord.com',
  'slack.com',
  'reddit.com',
  'linkedin.com',
  'steampowered.com',
  'store.steampowered.com',
  'epicgames.com',
  'twitch.tv',
  'cloudflare.com',
  'digitalocean.com',
  'hetzner.com',
  'vercel.com',
  'netlify.com',
  'heroku.com',
  'npmjs.com',
  'pypi.org',
  'docker.com',
  'openai.com',
  'notion.so',
  'figma.com',
  'atlassian.com',
  'zoom.us',
  'adobe.com',
  'yahoo.com',
  'shopify.com',
];

export function supportsTwoFactor(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const hostname = url.includes('://') ? new URL(url).hostname : new URL(`https://${url}`).hostname;
    const cleanHost = hostname.toLowerCase().replace(/^www\./, '');
    return COMMON_2FA_DOMAINS.some((d) => cleanHost === d || cleanHost.endsWith(`.${d}`));
  } catch {
    const cleanUrl = url.toLowerCase();
    return COMMON_2FA_DOMAINS.some((d) => cleanUrl.includes(d));
  }
}

export function itemNeedsTwoFactor(item: VaultItem): boolean {
  if (item.category !== 'login') return false;
  if (item.totpSecret || item.passkeyCredentialId) return false;
  return supportsTwoFactor(item.url);
}

export function getPasswordAgeInDays(updatedAt: string): number {
  if (!updatedAt) return 0;
  const updated = new Date(updatedAt).getTime();
  if (isNaN(updated)) return 0;
  const diffTime = Date.now() - updated;
  return Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
}

export function getItemPasswordAgeInDays(item: VaultItem): number {
  if (Array.isArray(item.passwordHistory) && item.passwordHistory.length > 0) {
    let latestMs = -1;
    let latestStr = '';
    for (const entry of item.passwordHistory) {
      const ms = new Date(entry.changedAt).getTime();
      if (!Number.isNaN(ms) && ms > latestMs) {
        latestMs = ms;
        latestStr = entry.changedAt;
      }
    }
    if (latestStr) {
      return getPasswordAgeInDays(latestStr);
    }
  }
  return getPasswordAgeInDays(item.updatedAt || item.createdAt);
}

function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
    return true;
  }
  if (host.endsWith('.local') || host.endsWith('.localhost')) {
    return true;
  }
  if (host.startsWith('10.') || host.startsWith('192.168.')) {
    return true;
  }
  const m172 = /^172\.(\d{1,3})\./.exec(host);
  if (m172) {
    const secondOctet = Number(m172[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }
  return false;
}

export function isUnsecureHttpUrl(url: string | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!/^http:\/\//i.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:') return false;
    return !isLocalOrPrivateHost(parsed.hostname);
  } catch {
    return true;
  }
}

const AUDIT_HISTORY_STORAGE_KEY = 'kalderashield-audit-history';

export function saveAuditScoreToHistory(score: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const historyJson = localStorage.getItem(AUDIT_HISTORY_STORAGE_KEY) || '[]';
    let history: { date: string; score: number }[] = JSON.parse(historyJson);
    if (!Array.isArray(history)) {
      history = [];
    }
    const today = new Date().toISOString().split('T')[0] ?? '';

    const existingIndex = history.findIndex((h) => h.date === today);
    if (existingIndex !== -1 && history[existingIndex]) {
      history[existingIndex].score = score;
    } else if (today) {
      history.push({ date: today, score });
    }

    history.sort((a, b) => a.date.localeCompare(b.date));
    if (history.length > 10) {
      history.shift();
    }

    localStorage.setItem(AUDIT_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save audit history:', e);
  }
}

export function clearAuditScoreHistory(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(AUDIT_HISTORY_STORAGE_KEY);
  } catch {
    // Ignore storage restriction errors
  }
}

export function getAuditScoreHistory(): { date: string; score: number }[] {
  if (typeof localStorage !== 'undefined') {
    try {
      const historyJson = localStorage.getItem(AUDIT_HISTORY_STORAGE_KEY);
      if (historyJson) {
        const history = JSON.parse(historyJson);
        if (Array.isArray(history) && history.length > 0) {
          return history.filter(
            (item): item is { date: string; score: number } =>
              typeof item === 'object' &&
              item !== null &&
              typeof item.date === 'string' &&
              typeof item.score === 'number',
          );
        }
      }
    } catch {
      // Ignore malformed storage data
    }
  }
  return [];
}

interface RunVaultAuditOptions {
  /** Optional set of item IDs whose passwords appeared in HIBP breach data. */
  pwnedItemIds?: ReadonlySet<string>;
  /** Whether to persist the resulting score into localStorage history (default: true). */
  persistHistory?: boolean;
}

/**
 * Performs a comprehensive audit of the entire vault collection.
 * Identifies weak, reused, breached, 2FA-missing, aged, and insecure HTTP items.
 */
export function runVaultAudit(items: VaultItem[], auditOptions: RunVaultAuditOptions = {}): AuditReport {
  const { pwnedItemIds, persistHistory = true } = auditOptions;

  if (items.length === 0) {
    return {
      score: 100,
      weakCount: 0,
      reusedCount: 0,
      secureCount: 0,
      totalCount: 0,
      pwnedCount: 0,
      missingTotpCount: 0,
      oldPasswordCount: 0,
      unsecureHttpCount: 0,
    };
  }

  let totalIndividualScore = 0;
  let passwordAuditedCount = 0;
  let weakCount = 0;
  let reusedCount = 0;
  let secureCount = 0;
  let pwnedCount = 0;
  let missingTotpCount = 0;
  let oldPasswordCount = 0;
  let unsecureHttpCount = 0;

  // Use Map instead of plain object so passwords like "constructor" or "toString" never collide with Object.prototype
  const passwordFreq = new Map<string, number>();
  items.forEach((item) => {
    const pw = item.password || '';
    if (pw) {
      passwordFreq.set(pw, (passwordFreq.get(pw) ?? 0) + 1);
    }
  });

  items.forEach((item) => {
    const pw = item.password || '';
    const isPasswordItem = item.category === 'login' || pw.length > 0;

    if (isPasswordItem) {
      passwordAuditedCount++;
      // O-5: the fast heuristic systematically over-reports (password123! → 70
      // "not weak" while zxcvbn rates it 0). Verify every "not weak" verdict
      // with real zxcvbn entropy scoring before trusting it; scores below the
      // weak threshold are already classified without the expensive call.
      let score = fastPasswordScore(pw);
      if (score >= PASSWORD_WEAK_SCORE_THRESHOLD) {
        score = calculatePasswordScore(pw);
      }
      totalIndividualScore += score;

      const isReused = Boolean(pw && (passwordFreq.get(pw) ?? 0) > 1);
      const isPwned = Boolean(pwnedItemIds?.has(item.id));

      if (isReused) {
        reusedCount++;
      }
      if (isPwned) {
        pwnedCount++;
      }

      if (pw.length < 8 || score < PASSWORD_WEAK_SCORE_THRESHOLD) {
        weakCount++;
      } else if (score >= PASSWORD_SECURE_SCORE_THRESHOLD && !isReused && !isPwned) {
        secureCount++;
      }
    }

    if (item.category === 'login') {
      if (itemNeedsTwoFactor(item)) {
        missingTotpCount++;
      }
      const age = getItemPasswordAgeInDays(item);
      if (age >= PASSWORD_OLD_AGE_DAYS) {
        oldPasswordCount++;
      }
    }

    if (isUnsecureHttpUrl(item.url)) {
      unsecureHttpCount++;
    }
  });

  // Calculate overall security rating
  const denominator = passwordAuditedCount > 0 ? passwordAuditedCount : items.length;
  const averageScore = passwordAuditedCount > 0 ? totalIndividualScore / passwordAuditedCount : 100;
  const reusedPenalty = (reusedCount / denominator) * 35;
  const weakPenalty = (weakCount / denominator) * 45;
  const pwnedPenalty = pwnedCount > 0 ? Math.min(60, 20 + (pwnedCount / denominator) * 45) : 0;

  // NIST / Advanced security checks penalties
  const unsecureHttpPenalty = Math.min(20, unsecureHttpCount * 5);
  const oldPasswordPenalty = Math.min(15, oldPasswordCount * 3);
  const missingTotpPenalty = Math.min(20, missingTotpCount * 4);

  const rawScore =
    averageScore
    - reusedPenalty
    - weakPenalty
    - pwnedPenalty
    - unsecureHttpPenalty
    - oldPasswordPenalty
    - missingTotpPenalty;
  let finalScore = Math.max(10, Math.min(100, Math.round(rawScore)));
  // A vault with known breached passwords must never display an "Excellent" score.
  if (pwnedCount > 0) {
    finalScore = Math.min(finalScore, 74);
  }

  if (persistHistory) {
    saveAuditScoreToHistory(finalScore);
  }

  return {
    score: finalScore,
    weakCount,
    reusedCount,
    secureCount,
    totalCount: items.length,
    pwnedCount,
    missingTotpCount,
    oldPasswordCount,
    unsecureHttpCount,
  };
}

const AMBIGUOUS_CHARS_RE = /[O0Il1|]/g;

export interface GeneratedPasswordHistoryEntry {
  id: string;
  password: string;
  createdAt: string;
  mode: 'character' | 'diceware';
}

const MAX_GENERATOR_HISTORY = 20;
let generatedPasswordHistory: GeneratedPasswordHistoryEntry[] = [];

registerOnCloseSession(() => {
  generatedPasswordHistory = [];
});

export function recordGeneratedPassword(password: string, mode: 'character' | 'diceware'): GeneratedPasswordHistoryEntry[] {
  if (!password) return [...generatedPasswordHistory];
  const filtered = generatedPasswordHistory.filter((entry) => entry.password !== password);
  generatedPasswordHistory = [
    {
      id: `gen-${Date.now()}-${secureRandomIndex(1_000_000)}`,
      password,
      createdAt: new Date().toISOString(),
      mode,
    },
    ...filtered,
  ].slice(0, MAX_GENERATOR_HISTORY);
  return [...generatedPasswordHistory];
}

export function getGeneratedPasswordHistory(): GeneratedPasswordHistoryEntry[] {
  return [...generatedPasswordHistory];
}

export function clearGeneratedPasswordHistory(): void {
  generatedPasswordHistory = [];
}

/**
 * Generates a randomized password using cryptographically secure randomness when available.
 */
export function generatePassword(options: GeneratorOptions): string {
  const filterAmbiguous = (chars: string) =>
    options.excludeAmbiguous ? chars.replace(AMBIGUOUS_CHARS_RE, '') : chars;

  const uppercaseChars = filterAmbiguous('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  const lowercaseChars = filterAmbiguous('abcdefghijklmnopqrstuvwxyz');
  const numberChars = filterAmbiguous('0123456789');
  const defaultSymbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const rawSymbols =
    typeof options.customSymbols === 'string' && options.customSymbols.trim().length > 0
      ? [...new Set(options.customSymbols.trim().split(''))].join('')
      : defaultSymbols;
  const symbolChars = filterAmbiguous(rawSymbols) || filterAmbiguous(defaultSymbols);

  let pool = '';
  let requiredChars = '';

  if (options.uppercase && uppercaseChars.length > 0) {
    pool += uppercaseChars;
    requiredChars += uppercaseChars[secureRandomIndex(uppercaseChars.length)] ?? '';
  }
  if (options.lowercase && lowercaseChars.length > 0) {
    pool += lowercaseChars;
    requiredChars += lowercaseChars[secureRandomIndex(lowercaseChars.length)] ?? '';
  }
  if (options.numbers && numberChars.length > 0) {
    pool += numberChars;
    requiredChars += numberChars[secureRandomIndex(numberChars.length)] ?? '';
  }
  if (options.symbols && symbolChars.length > 0) {
    pool += symbolChars;
    requiredChars += symbolChars[secureRandomIndex(symbolChars.length)] ?? '';
  }

  // Fallback to lowercase if no options chosen
  if (!pool) {
    pool = lowercaseChars || 'abcdefghijklmnopqrstuvwxyz';
    requiredChars += pool[secureRandomIndex(pool.length)] ?? '';
  }

  const passwordArray: string[] = requiredChars.split('');

  // Fill up to target length
  const remainingLength = options.length - passwordArray.length;
  for (let i = 0; i < remainingLength; i++) {
    const char = pool[secureRandomIndex(pool.length)];
    if (char) passwordArray.push(char);
  }

  // Shuffle password characters
  for (let i = passwordArray.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    const tempI = passwordArray[i];
    const tempJ = passwordArray[j];
    if (tempI !== undefined && tempJ !== undefined) {
      passwordArray[i] = tempJ;
      passwordArray[j] = tempI;
    }
  }

  return passwordArray.join('');
}

/**
 * Validates that the master password meets length and complexity requirements:
 * - Minimum length: 12 characters
 * - NIST 800-63B Alignment:
 *   - Checks against dictionary/compromised passwords (zxcvbn score >= 3) for all lengths.
 *   - Waives complexity rules for passphrases (length >= 16) that pass the score threshold.
 *   - Enforces a complexity requirement of >= 3 character classes for short passwords (12-15 chars).
 */
export function validateMasterPassword(password: string): boolean {
  if (!password || password.length < 12) {
    return false;
  }

  // NIST 800-63B: Reject if the password is too weak/predictable
  if (zxcvbn(password).score < 3) {
    return false;
  }

  // Waive complexity rules for long passwords (passphrases) >= 16 chars
  if (password.length >= 16) {
    return true;
  }

  // Enforce basic complexity for shorter passwords (12-15 chars)
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const classCount = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;
  
  return classCount >= 3;
}

