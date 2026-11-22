/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { formatLocalizedDateTime, formatPercent, getAvatarToneClass } from './formatters';

describe('formatters', () => {
  it('formats valid ISO timestamps into human-readable localized strings and handles fallbacks', () => {
    const formattedTr = formatLocalizedDateTime('2026-10-01T06:09:12.898Z', 'tr');
    const formattedEn = formatLocalizedDateTime('2026-10-01T06:09:12.898Z', 'en');

    expect(formattedTr).not.toBe('2026-10-01T06:09:12.898Z');
    expect(formattedTr).toContain('2026');
    expect(formattedEn).not.toBe('2026-10-01T06:09:12.898Z');
    expect(formattedEn).toContain('2026');
    expect(formatLocalizedDateTime(undefined, 'tr')).toBe('—');
    expect(formatLocalizedDateTime('not-a-date', 'en')).toBe('not-a-date');
  });

  it('formats percentages with locale-appropriate symbol placement', () => {
    expect(formatPercent(91, 'tr')).toBe('%91');
    expect(formatPercent(91, 'en')).toBe('91%');
    expect(formatPercent(100, 'de')).toBe('100%');
    expect(formatPercent(71.6, 'en')).toBe('72%');
  });

  it('returns deterministic tinted avatar classes per item seed', () => {
    const first = getAvatarToneClass('GitHub');
    const second = getAvatarToneClass('GitHub');
    expect(first).toBe(second);
    expect(first).toContain('border-');
  });
});
