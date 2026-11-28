import { invoke } from '@tauri-apps/api/core';
import { isDesktopRuntime } from './desktopStorage';

export const DEFAULT_CLIPBOARD_CLEAR_DELAY_MS = 30_000;
export const CLIPBOARD_HISTORY_OVERWRITE_TEXT = 'KalderaShield clipboard cleared';

export async function writeClipboardText(text: string): Promise<boolean> {
  if (isDesktopRuntime()) {
    try {
      const success = await invoke<boolean>('write_clipboard_text_protected', { text });
      if (success) return true;
    } catch (e) {
      console.warn('Native protected clipboard write failed, falling back to navigator.clipboard:', e);
    }
  }

  const clipboard = navigator.clipboard;
  if (!clipboard?.writeText) return false;

  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function overwriteThenClearClipboard(): Promise<boolean> {
  const overwritten = await writeClipboardText(CLIPBOARD_HISTORY_OVERWRITE_TEXT);
  const cleared = await writeClipboardText('');
  return overwritten && cleared;
}

export async function clearClipboardIfUnchanged(expectedText: string): Promise<boolean> {
  if (!expectedText) return false;

  if (isDesktopRuntime()) {
    try {
      const cleared = await invoke<boolean>('clear_clipboard_if_unchanged_protected', { expectedText });
      if (cleared) return true;
    } catch {
      // Fall through to WebView clipboard fallback
    }
  }

  const clipboard = navigator.clipboard;
  if (!clipboard?.readText || !clipboard?.writeText) return false;

  try {
    const currentText = await clipboard.readText();
    if (currentText !== expectedText) return false;

    return await overwriteThenClearClipboard();
  } catch {
    return false;
  }
}
