import { describe, expect, it } from 'vitest';
import {
  MAX_NOTE_LENGTH,
  applyNotePolicyToItems,
  sanitizeNoteText,
  validateNoteSecurity,
} from './notes';

describe('notes security and sanitization', () => {
  it('handles non-string inputs safely', () => {
    expect(sanitizeNoteText(null)).toBe('');
    expect(sanitizeNoteText(undefined)).toBe('');
    expect(sanitizeNoteText(12345)).toBe('');
    expect(sanitizeNoteText({})).toBe('');
  });

  it('preserves clean multiline text and tabs', () => {
    const input = 'Line 1\nLine 2\r\n\tTabbed content\n\nParagraph 2';
    expect(sanitizeNoteText(input)).toBe(input);
  });

  it('strips dangerous control characters and null bytes', () => {
    const malicious = 'Hello\x00World\x07\x08\x1B[31mRed\x1FText\x7F!';
    expect(sanitizeNoteText(malicious)).toBe('HelloWorld[31mRedText!');
  });

  it('normalizes Unicode characters into NFC', () => {
    // e + acute accent decomposed (NFD)
    const decomposed = 'é';
    // Single character é (NFC)
    const composed = 'é';
    expect(sanitizeNoteText(decomposed)).toBe(composed);
  });

  describe('invisible formatting characters', () => {
    it('strips the U+202E right-to-left override that reverses what a note reads as', () => {
      // "gnp.exe" written so it renders as "exe.png"
      const spoofed = 'invoice\u202Egnp.exe';
      expect(sanitizeNoteText(spoofed)).toBe('invoicegnp.exe');
      expect(validateNoteSecurity(spoofed).code).toBe('control-characters');
    });

    it('strips bidi embeddings, overrides, isolates and deprecated format characters', () => {
      const attacked = 'a\u202Ab\u202Bc\u202Cd\u2066e\u2067f\u2068g\u2069h\u206Ai';
      expect(sanitizeNoteText(attacked)).toBe('abcdefghi');
    });

    it('strips the marks and zero-width no-break space that survive copy/paste', () => {
      expect(sanitizeNoteText('a\u200Eb\u200Fc\uFEFFd\u061Ce\u00ADf')).toBe('abcdef');
    });

    it('keeps the zero-width characters that carry real meaning in text and emoji', () => {
      // ZWJ builds the family emoji; ZWNJ and ZWSP are letters in Persian,
      // Arabic and Indic scripts. Stripping them would corrupt legitimate notes
      // in exactly the languages this project ships.
      const family = '👨‍👩‍👧';
      const persian = 'می‌رود';
      expect(sanitizeNoteText(family)).toBe(family);
      expect(sanitizeNoteText(persian)).toBe(persian);
    });

    it('is idempotent, which is what makes it safe to apply at more than one layer', () => {
      const once = sanitizeNoteText('note\u202Ewith\u0000junk\uFEFF');
      expect(sanitizeNoteText(once)).toBe(once);
    });
  });

  describe('length policy', () => {
    it('no longer truncates: a long note is returned whole', () => {
      const huge = 'a'.repeat(MAX_NOTE_LENGTH + 500);
      expect(sanitizeNoteText(huge).length).toBe(huge.length);
    });

    it('refuses a long note with a stable code rather than shortening it', () => {
      const check = validateNoteSecurity('x'.repeat(MAX_NOTE_LENGTH + 1));
      expect(check.valid).toBe(false);
      expect(check.code).toBe('too-long');
      expect(check.reason).toContain('exceeds maximum length');
    });

    it('accepts a note exactly at the limit', () => {
      expect(validateNoteSecurity('x'.repeat(MAX_NOTE_LENGTH)).valid).toBe(true);
    });
  });

  it('validates note security constraints properly', () => {
    expect(validateNoteSecurity('Valid note content with\nlines.').valid).toBe(true);

    const withNull = validateNoteSecurity('Bad\x00note');
    expect(withNull.valid).toBe(false);
    expect(withNull.code).toBe('control-characters');
    expect(withNull.reason).toContain('disallowed control');

    const nonString = validateNoteSecurity(12345 as any);
    expect(nonString.valid).toBe(false);
    expect(nonString.code).toBe('not-a-string');
    expect(nonString.reason).toContain('must be a string');
  });

  it('reports the same verdict for the same input every time', () => {
    // Regression guard for the stateful-global-regex trap: a /g regex reused in
    // .test() carries lastIndex between calls and alternates its answer.
    const attacked = 'note\u202Ewith\u200Emarks';
    for (let i = 0; i < 5; i += 1) {
      expect(validateNoteSecurity(attacked).code).toBe('control-characters');
    }
  });
});

describe('applyNotePolicyToItems', () => {
  it('sanitizes notes on the way to storage', () => {
    const [item] = applyNotePolicyToItems([{ id: '1', notes: 'pay\u202Ement' }]);
    expect(item!.notes).toBe('payment');
  });

  it('leaves items without a note alone', () => {
    const input = [{ id: '1' }];
    expect(applyNotePolicyToItems(input)[0]).toBe(input[0]);
  });

  it('returns the same array when nothing changed, so unchanged writes do not re-encrypt', () => {
    const input = [{ id: '1', notes: 'clean' }, { id: '2' }];
    expect(applyNotePolicyToItems(input)).toBe(input);
  });

  it('does not mutate its input', () => {
    const item = { id: '1', notes: 'pay\u202Ement' };
    applyNotePolicyToItems([item]);
    expect(item.notes).toBe('pay\u202Ement');
  });

  it('does not truncate at the storage boundary either', () => {
    const long = 'a'.repeat(MAX_NOTE_LENGTH + 1);
    const [item] = applyNotePolicyToItems([{ id: '1', notes: long }]);
    expect(item!.notes).toBe(long);
  });
});
