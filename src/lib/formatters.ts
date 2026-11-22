/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const AVATAR_TONES = [
  'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  'bg-sky-500/15 text-sky-400 border-sky-500/25',
  'bg-violet-500/15 text-violet-400 border-violet-500/25',
  'bg-amber-500/15 text-amber-400 border-amber-500/25',
  'bg-rose-500/15 text-rose-400 border-rose-500/25',
  'bg-teal-500/15 text-teal-400 border-teal-500/25',
] as const;

/**
 * Formats an ISO-8601 timestamp into a human-friendly localized date/time string.
 * Falls back gracefully to the raw string if the input is not a valid date.
 */
export function formatLocalizedDateTime(value: string | undefined, language = 'tr'): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat(language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsed);
  } catch {
    return parsed.toLocaleDateString();
  }
}

/**
 * Formats a percentage according to locale conventions:
 * Turkish prefixes `%` (`%91`), while English and most other locales suffix `%` (`91%`).
 */
export function formatPercent(value: number, language = 'tr'): string {
  const safe = Number.isFinite(value) ? Math.round(value) : 0;
  return language === 'tr' ? `%${safe}` : `${safe}%`;
}

/**
 * Returns a deterministic soft-tinted avatar class for vault items without a platform logo.
 */
export function getAvatarToneClass(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}
