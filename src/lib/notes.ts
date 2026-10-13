/**
 * @file notes.ts
 * @description Note text policy: what may be stored in a vault item's free-form
 * note, and what is refused at authoring time.
 *
 * Two questions that used to be answered by the same function are now kept
 * apart, because they have different owners:
 *
 * 1. **"Is this text safe to store?"** — {@link sanitizeNoteText} and
 *    {@link validateNoteSecurity}. Strips the character classes a note is
 *    actually attacked with inside a password manager, and reports the rest.
 *    Lossless for legitimate text and idempotent.
 * 2. **"May this text be authored?"** — {@link MAX_NOTE_LENGTH}, enforced in the
 *    form with a visible error.
 *
 * ## Why the truncation was removed
 *
 * The sanitizer used to slice at 100,000 characters. That was invisible in all
 * five paths a note can enter the vault through — the form, the importer, the
 * share recipient, backup import, and migration — so a pasted 250 KB log came
 * back 100,000 characters shorter with nothing on screen saying so. The cap was
 * doing a real job (bounding memory) at the wrong place (inside a function whose
 * name says nothing about losing data).
 *
 * The cap is now an authoring limit with a visible failure. Imported and shared
 * notes are kept whole; they arrived inside a file the user chose to open, and
 * that file is already size-bounded upstream (`backupValidation` rejects
 * oversized backups).
 *
 * ## Why the invisible-character class is what it is
 *
 * Bidi overrides are the practical spoofing vector for vault notes: U+202E
 * renders everything after it right-to-left, so "gnp.exe" can be made to read
 * as "exe.png" in a note the user is reading before they click. The isolates
 * (U+2066-U+2069) do the same job more quietly.
 *
 * U+200B, U+200C and U+200D are deliberately **kept**. They look equally
 * invisible, but they carry meaning: ZWJ builds emoji sequences, ZWNJ and ZWSP
 * are letters in Persian, Arabic and Indic scripts. Stripping them corrupts
 * legitimate notes in exactly the languages this project ships. A rule that
 * removes what it cannot explain is a rule that will be turned off.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

/**
 * Authoring limit for a single note, in characters.
 *
 * Enforced in the form with a visible error. Not enforced by truncating — see
 * the file header.
 */
export const MAX_NOTE_LENGTH = 100_000;

/**
 * C0 controls and DEL, minus the three whitespace controls a note legitimately
 * contains (\t \n \r).
 *
 * Held as source rather than as a literal so the matching and the replacing
 * form can be built from it. A `/g` regex carries `lastIndex` between calls, so
 * reusing the replacing form in `RegExp.test()` would return true and false for
 * the same string depending on call order.
 */
const CONTROL_CHARACTERS_SOURCE = '\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F';

/**
 * Invisible formatting characters with no legitimate use in a note.
 *
 * - U+00AD   soft hyphen — invisible, renders as nothing, survives copy/paste
 * - U+061C   Arabic letter mark
 * - U+200E/U+200F  left/right-to-left mark
 * - U+202A-U+202E  bidi embedding/override, including the U+202E reversal
 * - U+2060   word joiner
 * - U+2061-U+2064  invisible math operators
 * - U+2066-U+2069  bidi isolates
 * - U+206A-U+206F  deprecated format characters
 * - U+FEFF   zero-width no-break space / BOM
 */
const INVISIBLE_FORMATTING_CHARACTERS_SOURCE =
  '\\u00AD\\u061C\\u200E\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u206F\\uFEFF';

const CONTROL_CHARACTERS = new RegExp(`[${CONTROL_CHARACTERS_SOURCE}]`, 'g');
const INVISIBLE_FORMATTING_CHARACTERS =
  new RegExp(`[${INVISIBLE_FORMATTING_CHARACTERS_SOURCE}]`, 'g');
const DISALLOWED_CHARACTERS = new RegExp(
  `[${CONTROL_CHARACTERS_SOURCE}${INVISIBLE_FORMATTING_CHARACTERS_SOURCE}]`,
);

/** Machine-readable reason a note was refused. Stable: callers may branch on it. */
export type NoteSecurityViolation = 'not-a-string' | 'control-characters' | 'too-long';

export interface NoteSecurityCheck {
  valid: boolean;
  /** Stable code; absent when `valid` is true. */
  code?: NoteSecurityViolation;
  /** Developer-facing explanation. Not user-facing: the UI shows a localized message. */
  reason?: string;
}

/**
 * Removes the character classes this module considers unsafe, and normalizes to
 * NFC. Does not truncate and does not otherwise alter legitimate text.
 *
 * Idempotent: sanitizing an already-sanitized string returns it unchanged, which
 * is what makes it safe to apply at more than one layer.
 */
export function sanitizeNoteText(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }

  let sanitized = raw.replace(CONTROL_CHARACTERS, '').replace(INVISIBLE_FORMATTING_CHARACTERS, '');

  // Unicode normalization (NFC). Guarded because a hostile `String.prototype`
  // shim in an embedded webview can make normalize throw, and losing the note
  // would be a worse outcome than keeping the decomposed form.
  try {
    sanitized = sanitized.normalize('NFC');
  } catch {
    // Keep the un-normalized text rather than failing the save.
  }

  return sanitized;
}

/**
 * Reports whether a note may be authored, without modifying it.
 *
 * Callers show a localized message; `reason` exists for logs and tests.
 */
export function validateNoteSecurity(note: unknown): NoteSecurityCheck {
  if (typeof note !== 'string') {
    return { valid: false, code: 'not-a-string', reason: 'Note must be a string' };
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return {
      valid: false,
      code: 'too-long',
      reason: `Note exceeds maximum length of ${MAX_NOTE_LENGTH} characters`,
    };
  }
  if (DISALLOWED_CHARACTERS.test(note)) {
    return {
      valid: false,
      code: 'control-characters',
      reason: 'Note contains disallowed control or invisible formatting characters',
    };
  }
  return { valid: true };
}

/**
 * Applies {@link sanitizeNoteText} to every item's note, returning new items
 * only where the note actually changed.
 *
 * This is the storage-boundary entry point. Every write path — form, importer,
 * share recipient, backup import — reaches the repository through one of
 * `saveVaultItem`, `saveVaultItems` or `replaceVaultItems`, so sanitizing here
 * means a future caller cannot skip the policy by forgetting it. It cannot
 * truncate, so a note that is too long is refused upstream (see the form) or
 * stored whole (see the file header) — never silently shortened here.
 */
export function applyNotePolicyToItems<T extends object>(items: T[]): T[] {
  let changed = false;
  const next = items.map((item) => {
    const notes = (item as { notes?: unknown }).notes;
    // Only a string can be a note. A non-string here is not a note to clean, it
    // is a caller that has not built an item yet, and rewriting it to '' would
    // destroy whatever it actually is.
    if (typeof notes !== 'string') return item;
    const sanitized = sanitizeNoteText(notes);
    if (sanitized === notes) return item;
    changed = true;
    return { ...item, notes: sanitized };
  });
  return changed ? next : items;
}
