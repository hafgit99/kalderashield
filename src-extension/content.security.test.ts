/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('extension secure password generator', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: { addListener: vi.fn() },
        sendMessage: vi.fn((_message: unknown, callback?: (response: unknown) => void) => {
          callback?.({});
        }),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses WebCrypto-backed unbiased selection and never Math.random', async () => {
    const mathRandomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used by extension password generation');
    });

    const { generateSecurePassword } = await import('./content');
    const password = generateSecurePassword(32);

    expect(password).toHaveLength(32);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[0-9]/);
    expect([...password].some((char) => '!@#$%^&*()-_=+[]{}|;:,.<>?'.includes(char))).toBe(true);
    expect(mathRandomSpy).not.toHaveBeenCalled();
  });

  it('enforces a minimum generated length that preserves all required character groups', async () => {
    const { generateSecurePassword } = await import('./content');

    const password = generateSecurePassword(1);

    expect(password).toHaveLength(4);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[0-9]/);
    expect([...password].some((char) => '!@#$%^&*()-_=+[]{}|;:,.<>?'.includes(char))).toBe(true);
  });
});

describe('extension password-change detection & visible inline generator', () => {
  let capturedShadowRoot: ShadowRoot | null = null;
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    document.body.innerHTML = '';
    capturedShadowRoot = null;

    const origAttachShadow = Element.prototype.attachShadow;
    vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function (this: Element, init: ShadowRootInit) {
      const root = origAttachShadow.call(this, init);
      capturedShadowRoot = root;
      return root;
    });

    sendMessageMock = vi.fn((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({});
    });

    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: { addListener: vi.fn() },
        sendMessage: sendMessageMock,
      },
      storage: {
        local: {
          get: vi.fn((_keys, callback) => callback?.({})),
          set: vi.fn(),
        },
      },
    });
    vi.stubGlobal('navigator', {
      language: 'en',
      clipboard: {
        writeText: vi.fn(async () => undefined),
        readText: vi.fn(async () => ''),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('classifies pending credentials into none, update, or save accurately', async () => {
    const { classifyPendingCredential } = await import('./content');
    const saved = [
      { id: 'cred-1', title: 'Example', username: 'alice@example.com', password: 'OldPassword!1', url: 'https://example.com' },
      { id: 'cred-2', title: 'Example Work', username: 'work@example.com', password: 'WorkPassword!1', url: 'https://example.com' },
    ];

    // Exact match -> no banner
    expect(
      classifyPendingCredential({ username: 'alice@example.com', password: 'OldPassword!1' }, saved),
    ).toEqual({ action: 'none' });

    // Existing account with new password -> update that exact account
    const sameUserUpdate = classifyPendingCredential(
      { username: 'ALICE@example.com', password: 'NewPassword!9' },
      saved,
    );
    expect(sameUserUpdate.action).toBe('update');
    if (sameUserUpdate.action === 'update') {
      expect(sameUserUpdate.target.id).toBe('cred-1');
    }

    // Brand new username on same site -> save new credential
    expect(
      classifyPendingCredential({ username: 'charlie@example.com', password: 'BrandNew!9' }, saved),
    ).toEqual({ action: 'save' });

    // Password-change form without username field -> update matching site account (preferring last used account)
    const noUserUpdate = classifyPendingCredential(
      { username: '', password: 'RotatedPassword!9' },
      saved,
      'work@example.com',
    );
    expect(noUserUpdate.action).toBe('update');
    if (noUserUpdate.action === 'update') {
      expect(noUserUpdate.target.id).toBe('cred-2');
      expect(noUserUpdate.candidates).toHaveLength(2);
    }
  });

  it('picks the new password (not current password) and never overwrites current-password on change-password forms', async () => {
    const { findFillableNewPasswordTargets, selectSubmittedPasswordInput } = await import('./content');

    document.body.innerHTML = `
      <form id="pw-change">
        <input id="oldPw" type="password" name="current_password" autocomplete="current-password" value="OldPass!123" />
        <input id="newPw" type="password" name="new_password" autocomplete="new-password" value="NewPass!456" />
        <input id="confirmPw" type="password" name="confirm_password" autocomplete="new-password" value="NewPass!456" />
      </form>
    `;

    const oldPw = document.getElementById('oldPw') as HTMLInputElement;
    const newPw = document.getElementById('newPw') as HTMLInputElement;
    const confirmPw = document.getElementById('confirmPw') as HTMLInputElement;

    // Submitting change-password form must capture the NEW password, never current_password
    expect(selectSubmittedPasswordInput([oldPw, newPw, confirmPw])).toBe(confirmPw);

    // Generating a password from newPw fills newPw + confirmPw while leaving oldPw untouched
    const targets = findFillableNewPasswordTargets(newPw);
    expect(targets).toContain(newPw);
    expect(targets).toContain(confirmPw);
    expect(targets).not.toContain(oldPw);
  });

  it('shows generated password visibly in plain text inside Shadow DOM and fills target + confirm without dots', async () => {
    document.body.innerHTML = `
      <form id="signup-form">
        <div><input id="currentPw" type="password" autocomplete="current-password" value="Existing!123" /></div>
        <div><input id="newPw" type="password" autocomplete="new-password" /></div>
        <div><input id="confirmPw" type="password" name="confirm_password" /></div>
      </form>
    `;

    sendMessageMock.mockImplementation((msg: { action?: string }, cb?: (res: unknown) => void) => {
      if (msg.action === 'query_credentials') {
        cb?.({ locked: false, credentials: [] });
        return;
      }
      cb?.({});
    });

    await import('./content');

    const newPw = document.getElementById('newPw') as HTMLInputElement;
    const confirmPw = document.getElementById('confirmPw') as HTMLInputElement;
    const currentPw = document.getElementById('currentPw') as HTMLInputElement;
    const iconBtn = newPw.parentElement?.querySelector('.KalderaShield-icon-btn') as HTMLButtonElement;
    expect(iconBtn).toBeTruthy();

    // Open dropdown via extension icon button
    iconBtn.click();
    expect(capturedShadowRoot).not.toBeNull();

    const genTrigger = capturedShadowRoot!.querySelector('.KalderaShield-gen-trigger') as HTMLElement;
    expect(genTrigger).toBeTruthy();
    genTrigger.click();

    const preview = capturedShadowRoot!.querySelector('[data-testid="generated-password-preview"]') as HTMLElement;
    expect(preview).toBeTruthy();
    expect(preview.getAttribute('data-revealed')).toBe('true');

    const visiblePassword = preview.textContent || '';
    expect(visiblePassword).toHaveLength(20);
    expect(visiblePassword).not.toMatch(/^•+$/);

    // Toggle hide -> shows bullets, toggle show -> restores exact password
    const eyeBtn = capturedShadowRoot!.querySelector('.KalderaShield-gen-eye-btn') as HTMLButtonElement;
    eyeBtn.click();
    expect(preview.getAttribute('data-revealed')).toBe('false');
    expect(preview.textContent).toBe('•'.repeat(20));

    eyeBtn.click();
    expect(preview.getAttribute('data-revealed')).toBe('true');
    expect(preview.textContent).toBe(visiblePassword);

    // Click Use Password -> fills newPw + confirmPw, leaves currentPw untouched
    const useBtn = capturedShadowRoot!.querySelector('.KalderaShield-gen-btn-primary') as HTMLButtonElement;
    useBtn.click();

    expect(newPw.value).toBe(visiblePassword);
    expect(confirmPw.value).toBe(visiblePassword);
    expect(currentPw.value).toBe('Existing!123');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(visiblePassword);
  });

  it('prompts to update an existing saved credential when password changes on a site', async () => {
    let storedPending: unknown = null;

    sendMessageMock.mockImplementation((msg: { action?: string; credential?: unknown }, cb?: (res: unknown) => void) => {
      if (msg.action === 'set_pending_credential') {
        storedPending = msg.credential;
        cb?.({ status: 'ok' });
        return;
      }
      if (msg.action === 'get_pending_credential') {
        cb?.({ credential: storedPending });
        return;
      }
      if (msg.action === 'query_credentials') {
        cb?.({
          locked: false,
          credentials: [
            {
              id: 'vault-item-99',
              title: 'My Site',
              username: 'alice@example.com',
              password: 'OldPassword!1',
              url: window.location.href,
              category: 'login',
            },
          ],
        });
        return;
      }
      cb?.({ status: 'ok', updated: true });
    });

    document.body.innerHTML = `
      <form id="change-pw-form">
        <input id="cur" type="password" autocomplete="current-password" value="OldPassword!1" />
        <input id="new1" type="password" autocomplete="new-password" value="BrandNewPass!2026" />
        <input id="new2" type="password" name="confirm_password" value="BrandNewPass!2026" />
        <button type="submit">Şifreyi Güncelle</button>
      </form>
    `;

    await import('./content');

    // Submit the change-password form (SPA flow without page reload)
    const form = document.getElementById('change-pw-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    // Advance SPA evaluation timer (1200ms)
    await vi.advanceTimersByTimeAsync(1300);

    expect(capturedShadowRoot).not.toBeNull();
    const updateBtn = capturedShadowRoot!.querySelector('.KalderaShield-banner-btn-update') as HTMLButtonElement;
    expect(updateBtn).toBeTruthy();

    updateBtn.click();

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update_existing_credential',
        credential: expect.objectContaining({
          id: 'vault-item-99',
          username: 'alice@example.com',
          password: 'BrandNewPass!2026',
        }),
      }),
      expect.any(Function),
    );
  });
});

describe('extension popup secure clipboard copy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="lockedScreen"></div>
      <div id="credentialList"></div>
      <div id="searchWrapper"></div>
      <input id="searchInput" />
      <div id="phishingBanner"></div>
      <span id="phishingText"></span>
      <select id="langSelect"><option value="en">en</option></select>
      <button id="themeToggle"></button>
      <div id="toast"></div>
      <button id="focusAppBtn"></button>
      <button type="button" id="autoSubmitBtn"></button>
      <span id="autoSubmitText"></span>
      <h1 id="lockedTitle"></h1>
      <p id="lockedDesc"></p>
    `;
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn((_keys, callback) => callback?.({})),
          set: vi.fn(),
        },
      },
      runtime: {
        sendMessage: vi.fn(),
      },
      tabs: {
        query: vi.fn((_query, callback) => callback?.([])),
      },
    });
    vi.stubGlobal('navigator', {
      language: 'en',
      clipboard: {
        writeText: vi.fn(async () => undefined),
        readText: vi.fn(async () => 'secret-copied-pass'),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('automatically clears sensitive copied passwords after 30 seconds', async () => {
    const { copyToClipboardSecurely } = await import('./popup');

    copyToClipboardSecurely('secret-copied-pass', true);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('secret-copied-pass');

    // Fast-forward 30 seconds
    await vi.advanceTimersByTimeAsync(30000);

    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('');
  });
});

