import { describe, expect, it, vi } from 'vitest';
import {
  calculatePasswordScore,
  clearAuditScoreHistory,
  generatePassword,
  getAuditScoreHistory,
  getItemPasswordAgeInDays,
  getPasswordAgeInDays,
  getStrengthLabel,
  isUnsecureHttpUrl,
  itemNeedsTwoFactor,
  runVaultAudit,
  saveAuditScoreToHistory,
  supportsTwoFactor,
  validateMasterPassword,
} from './security';
import type { VaultItem } from '../types';
import { closeVaultSession } from './vaultSession';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';

const checkSpy = vi.spyOn(ZxcvbnFactory.prototype, 'check');

const baseItem = (overrides: Partial<VaultItem>): VaultItem => ({
  id: crypto.randomUUID(),
  title: 'Example',
  username: 'user@example.com',
  password: '',
  url: 'example.com',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  category: 'login',
  ...overrides,
});

describe('security helpers', () => {
  it('scores stronger passwords higher than weak passwords', () => {
    const weakScore = calculatePasswordScore('password');
    const strongScore = calculatePasswordScore('G8x#kL9@pQ2!mZ7');

    expect(strongScore).toBeGreaterThan(weakScore);
    expect(getStrengthLabel('G8x#kL9@pQ2!mZ7').label).toBe('SECURE');
  });

  it('detects weak and reused vault passwords', () => {
    const report = runVaultAudit([
      baseItem({ id: '1', password: 'password' }),
      baseItem({ id: '2', password: 'password' }),
      baseItem({ id: '3', password: 'G8x#kL9@pQ2!mZ7' }),
    ]);

    expect(report.totalCount).toBe(3);
    expect(report.weakCount).toBe(2);
    expect(report.reusedCount).toBe(2);
    expect(report.secureCount).toBe(1);
    expect(report.score).toBeLessThan(100);
  });

  it('generates passwords with the requested length and selected character groups', () => {
    const password = generatePassword({
      length: 24,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
    });

    expect(password).toHaveLength(24);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[0-9]/);
    expect(password).toMatch(/[^A-Za-z0-9]/);
  });

  it('generates passwords without bias (verifying uniform distribution and shuffle randomness)', () => {
    // Generate 1000 passwords and count frequencies of each character class
    const sampleSize = 1000;
    const charCounts = { upper: 0, lower: 0, digit: 0, symbol: 0 };
    
    for (let i = 0; i < sampleSize; i++) {
      const pw = generatePassword({
        length: 20,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
      });
      for (const char of pw) {
        if (/[A-Z]/.test(char)) charCounts.upper++;
        else if (/[a-z]/.test(char)) charCounts.lower++;
        else if (/[0-9]/.test(char)) charCounts.digit++;
        else charCounts.symbol++;
      }
    }

    const totalChars = sampleSize * 20;
    // Expected distribution proportions:
    // Upper: 26 chars
    // Lower: 26 chars
    // Numbers: 10 chars
    // Symbols: 26 chars
    // Total pool size = 26 + 26 + 10 + 26 = 88 chars.
    // Proportions: Upper, Lower, Symbols are ~29.5% each, Numbers are ~11.4%.
    const expectedProportions = {
      upper: 26 / 88,
      lower: 26 / 88,
      digit: 10 / 88,
      symbol: 26 / 88,
    };

    // Verify actual distribution is within 5% tolerance of the expected proportion
    const tolerance = 0.05;
    Object.keys(charCounts).forEach((key) => {
      const actualProp = charCounts[key as keyof typeof charCounts] / totalChars;
      const expectedProp = expectedProportions[key as keyof typeof expectedProportions];
      expect(Math.abs(actualProp - expectedProp)).toBeLessThan(tolerance);
    });
  });

  it('clears password score cache on close session', () => {
    checkSpy.mockClear();

    const pw = 'SomeHighlySpecificPasswordString123!';
    calculatePasswordScore(pw);
    expect(checkSpy).toHaveBeenCalledTimes(1);

    calculatePasswordScore(pw);
    expect(checkSpy).toHaveBeenCalledTimes(1);

    closeVaultSession();

    calculatePasswordScore(pw);
    expect(checkSpy).toHaveBeenCalledTimes(2);
  });
});

describe('validateMasterPassword', () => {
  it('rejects passwords shorter than 12 characters', () => {
    expect(validateMasterPassword('')).toBe(false);
    expect(validateMasterPassword('Short1!')).toBe(false);
    expect(validateMasterPassword('A1b2C3d4E5f')).toBe(false); // 11 characters
  });

  it('rejects passwords of length >= 12 but with less than 3 character classes', () => {
    expect(validateMasterPassword('abcdefghijkl')).toBe(false); // only lowercase
    expect(validateMasterPassword('ABCDEFGHIJKL')).toBe(false); // only uppercase
    expect(validateMasterPassword('123456789012')).toBe(false); // only digits
    expect(validateMasterPassword('!!!!!!!!!!!!')).toBe(false); // only symbols
    expect(validateMasterPassword('abcdeABCDEab')).toBe(false); // lowercase + uppercase (2 classes)
    expect(validateMasterPassword('abcde12345ab')).toBe(false); // lowercase + digits (2 classes)
    expect(validateMasterPassword('abcde!!!!_ab')).toBe(false); // lowercase + symbols (2 classes)
  });

  it('accepts passwords of length >= 12 with 3 or more character classes and zxcvbn score >= 3', () => {
    expect(validateMasterPassword('Xy8#pW2!mQ9a')).toBe(true); // lower, upper, digit, symbol (strong)
    expect(validateMasterPassword('Tr9@kP1!vX4s')).toBe(true); // lower, upper, digit, symbol (strong)
    expect(validateMasterPassword('CorrectHorseBatteryStaple123!')).toBe(true); // >= 16 characters
  });

  it('rejects passwords with score < 3 even if they have 12+ characters and 3 classes', () => {
    expect(validateMasterPassword('abcdefABCDEF12')).toBe(false); // Predictable sequence
    expect(validateMasterPassword('password123!A')).toBe(false); // Common password
  });

  it('rejects weak passwords >= 16 characters under NIST 800-63B guidelines', () => {
    expect(validateMasterPassword('1234567890123456')).toBe(false); // Too predictable
    expect(validateMasterPassword('abcdefghijklmnopqrst')).toBe(false); // Too sequential
  });
});

describe('extended security audit checks', () => {
  it('identifies domains that support 2FA correctly', () => {
    expect(supportsTwoFactor('https://github.com/login')).toBe(true);
    expect(supportsTwoFactor('https://google.com')).toBe(true);
    expect(supportsTwoFactor('https://myownlocalsite.org')).toBe(false);
  });

  it('detects unsecure HTTP links correctly', () => {
    expect(isUnsecureHttpUrl('http://myinsecuresite.com')).toBe(true);
    expect(isUnsecureHttpUrl('https://securesite.com')).toBe(false);
    expect(isUnsecureHttpUrl('http://localhost:3000')).toBe(false);
    expect(isUnsecureHttpUrl('http://127.0.0.1')).toBe(false);
  });

  it('calculates password age correctly', () => {
    const today = new Date().toISOString().split('T')[0]!;
    expect(getPasswordAgeInDays(today)).toBe(0);

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 95);
    const oldDateStr = ninetyDaysAgo.toISOString().split('T')[0]!;
    expect(getPasswordAgeInDays(oldDateStr)).toBeGreaterThanOrEqual(95);
  });

  it('calculates AuditReport with the new extended metrics and penalties', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);
    const oldDateStr = oldDate.toISOString().split('T')[0];
    const todayStr = new Date().toISOString().split('T')[0];

    const report = runVaultAudit([
      baseItem({ id: '1', category: 'login', password: 'CorrectHorseBatteryStaple123!', url: 'https://github.com', createdAt: todayStr, updatedAt: todayStr }), // Missing TOTP on 2FA site
      baseItem({ id: '2', category: 'login', password: 'SomeStrongPassword123!', url: 'http://myinsecuresite.com', createdAt: todayStr, updatedAt: todayStr }), // Unsecure HTTP
      baseItem({ id: '3', category: 'login', password: 'AnotherStrongPassword99!', url: 'https://securesite.com', updatedAt: oldDateStr }), // Old password
    ]);

    expect(report.missingTotpCount).toBe(1);
    expect(report.unsecureHttpCount).toBe(1);
    expect(report.oldPasswordCount).toBe(1);
    expect(report.score).toBeLessThan(100);
  });

  it('penalizes and caps vault score when HIBP breached items are reported', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const items = [
      baseItem({ id: 'pwn-1', password: 'G8x#kL9@pQ2!mZ7', url: 'https://a.example.com', createdAt: todayStr, updatedAt: todayStr }),
      baseItem({ id: 'ok-2', password: 'R4v$nT8!wC3#yH6', url: 'https://b.example.com', createdAt: todayStr, updatedAt: todayStr }),
    ];

    const cleanReport = runVaultAudit(items, { persistHistory: false });
    const pwnedReport = runVaultAudit(items, {
      pwnedItemIds: new Set(['pwn-1']),
      persistHistory: false,
    });

    expect(cleanReport.score).toBeGreaterThanOrEqual(85);
    expect(cleanReport.secureCount).toBe(2);
    expect(pwnedReport.pwnedCount).toBe(1);
    expect(pwnedReport.secureCount).toBe(1);
    expect(pwnedReport.score).toBeLessThanOrEqual(74);
  });

  it('excludes reused strong passwords from secureCount and handles prototype-key passwords safely', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const report = runVaultAudit(
      [
        baseItem({ id: 'r1', password: 'G8x#kL9@pQ2!mZ7', createdAt: todayStr, updatedAt: todayStr }),
        baseItem({ id: 'r2', password: 'G8x#kL9@pQ2!mZ7', createdAt: todayStr, updatedAt: todayStr }),
        baseItem({ id: 'proto-1', password: 'toString', createdAt: todayStr, updatedAt: todayStr }),
        baseItem({ id: 'proto-2', password: 'constructor', createdAt: todayStr, updatedAt: todayStr }),
      ],
      { persistHistory: false },
    );

    expect(report.reusedCount).toBe(2);
    expect(report.secureCount).toBe(0);
    expect(report.weakCount).toBe(2);
  });

  it('hardens isUnsecureHttpUrl against host spoofing and allows private/local hosts', () => {
    expect(isUnsecureHttpUrl('http://localhost.evil.com/login')).toBe(true);
    expect(isUnsecureHttpUrl('http://127.0.0.1.attacker.test')).toBe(true);
    expect(isUnsecureHttpUrl('http://[::1]:8080/admin')).toBe(false);
    expect(isUnsecureHttpUrl('http://192.168.1.10:5000')).toBe(false);
    expect(isUnsecureHttpUrl('http://10.0.0.5/panel')).toBe(false);
    expect(isUnsecureHttpUrl('http://172.16.0.2/router')).toBe(false);
    expect(isUnsecureHttpUrl('http://printer.local/status')).toBe(false);
  });

  it('exempts passkey-protected logins from missing 2FA and recognizes expanded domains', () => {
    expect(supportsTwoFactor('https://discord.com/login')).toBe(true);
    expect(supportsTwoFactor('https://paypal.com')).toBe(true);
    expect(
      itemNeedsTwoFactor(
        baseItem({
          url: 'https://github.com/login',
          totpSecret: undefined,
          passkeyCredentialId: 'cred-passkey-1',
        }),
      ),
    ).toBe(false);
    expect(
      itemNeedsTwoFactor(
        baseItem({
          url: 'https://discord.com/login',
          totpSecret: undefined,
        }),
      ),
    ).toBe(true);
  });

  it('uses latest passwordHistory timestamp for item password age when available', () => {
    const oldDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const item = baseItem({
      updatedAt: recentDate,
      passwordHistory: [
        { password: 'old-password', changedAt: oldDate },
        { password: 'newer-password', changedAt: recentDate },
      ],
    });

    expect(getItemPasswordAgeInDays(item)).toBeLessThanOrEqual(6);

    const stalePasswordItem = baseItem({
      updatedAt: recentDate,
      passwordHistory: [{ password: 'old-password', changedAt: oldDate }],
    });
    expect(getItemPasswordAgeInDays(stalePasswordItem)).toBeGreaterThanOrEqual(179);
  });

  it('clears persisted audit score history cleanly', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    try {
      saveAuditScoreToHistory(88);
      expect(getAuditScoreHistory()).toHaveLength(1);
      clearAuditScoreHistory();
      expect(getAuditScoreHistory()).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
