/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Sliders, 
  Copy, 
  Check, 
  RefreshCw, 
  KeyRound, 
  Sparkles, 
  BookOpen, 
  Hash, 
  Globe, 
  Minimize2,
  Lock,
  History,
  Trash2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { formatPercent } from '../lib/formatters';
import { progressWidthClass } from '../lib/progressWidth';
import { ColoredPassword } from './common/ColoredPassword';
import type { GeneratorOptions } from '../types';
import {
  generatePassword,
  calculatePasswordScore,
  getStrengthLabel,
  recordGeneratedPassword,
  getGeneratedPasswordHistory,
  clearGeneratedPasswordHistory,
  type GeneratedPasswordHistoryEntry,
} from '../lib/security';
import type { DicewareOptions } from '../lib/diceware';
import { calculateDicewareEntropyBits, generateDiceware } from '../lib/diceware';
import {
  clearClipboardIfUnchanged,
  DEFAULT_CLIPBOARD_CLEAR_DELAY_MS,
  writeClipboardText,
} from '../lib/clipboard';

interface PasswordGeneratorProps {
  onCopyText?: (text: string, field: string) => void;
  copiedField?: string | null;
}

export default function PasswordGenerator({ onCopyText, copiedField }: PasswordGeneratorProps = {}) {
  const { language, t } = useLanguage();
  const [mode, setMode] = useState<'character' | 'diceware'>('character');

  // Character-based states
  const [options, setOptions] = useState<GeneratorOptions>({
    length: 16,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
  });
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [customSymbols, setCustomSymbols] = useState('');

  // Diceware word-based states
  const [dicewareOptions, setDicewareOptions] = useState<DicewareOptions>({
    wordCount: 6,
    separator: 'hyphen',
    language: 'tr',
    capitalize: true,
    addNumber: true,
    addSymbol: false,
  });

  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<GeneratedPasswordHistoryEntry[]>(() =>
    getGeneratedPasswordHistory(),
  );
  const [copiedHistoryIndex, setCopiedHistoryIndex] = useState<number | null>(null);
  const copiedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboardClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCopiedPasswordRef = useRef<string | null>(null);

  const clearCopiedResetTimer = () => {
    if (copiedResetTimerRef.current) {
      clearTimeout(copiedResetTimerRef.current);
      copiedResetTimerRef.current = null;
    }
  };

  const clearClipboardTimer = () => {
    if (clipboardClearTimerRef.current) {
      clearTimeout(clipboardClearTimerRef.current);
      clipboardClearTimerRef.current = null;
    }
  };

  const clearLastCopiedPassword = () => {
    const lastCopiedPassword = lastCopiedPasswordRef.current;
    lastCopiedPasswordRef.current = null;
    if (lastCopiedPassword) {
      void clearClipboardIfUnchanged(lastCopiedPassword);
    }
  };

  // Auto generate on mount or options / mode change
  useEffect(() => {
    handleGenerate(false);
  }, [mode, options, excludeAmbiguous, customSymbols, dicewareOptions]);

  useEffect(
    () => () => {
      clearCopiedResetTimer();
      clearClipboardTimer();
      clearLastCopiedPassword();
    },
    [],
  );

  useEffect(() => {
    if (copiedField === 'generator_password') {
      setCopied(true);
      clearCopiedResetTimer();
      copiedResetTimerRef.current = setTimeout(() => {
        setCopied(false);
        copiedResetTimerRef.current = null;
      }, 2000);
    } else if (copiedField === null) {
      setCopied(false);
    }
  }, [copiedField]);

  const handleGenerate = (recordToHistory = true) => {
    clearCopiedResetTimer();
    clearClipboardTimer();
    clearLastCopiedPassword();
    let generated = '';
    if (mode === 'character') {
      const effectiveOptions: GeneratorOptions = {
        ...options,
        ...(excludeAmbiguous ? { excludeAmbiguous: true } : {}),
        ...(customSymbols.trim() ? { customSymbols: customSymbols.trim() } : {}),
      };
      generated = generatePassword(effectiveOptions);
      setPassword(generated);
    } else {
      generated = generateDiceware(dicewareOptions);
      setPassword(generated);
    }
    if (recordToHistory && generated) {
      recordGeneratedPassword(generated, mode);
      setHistoryEntries(getGeneratedPasswordHistory());
    }
    setCopied(false);
  };

  const copySecretWithAutoClear = (secret: string, fieldName: string) => {
    if (onCopyText) {
      onCopyText(secret, fieldName);
    } else {
      void writeClipboardText(secret);
    }
    clearClipboardTimer();
    lastCopiedPasswordRef.current = secret;
    clipboardClearTimerRef.current = setTimeout(() => {
      clearLastCopiedPassword();
      clipboardClearTimerRef.current = null;
    }, DEFAULT_CLIPBOARD_CLEAR_DELAY_MS);
  };

  const handleCopy = () => {
    if (!password) return;
    recordGeneratedPassword(password, mode);
    setHistoryEntries(getGeneratedPasswordHistory());
    copySecretWithAutoClear(password, 'generator_password');
    clearCopiedResetTimer();
    setCopied(true);
    copiedResetTimerRef.current = setTimeout(() => {
      setCopied(false);
      copiedResetTimerRef.current = null;
    }, 2000);
  };

  const handleCopyHistoryEntry = (entryPassword: string, index: number) => {
    copySecretWithAutoClear(entryPassword, `generator_history_${index}`);
    setCopiedHistoryIndex(index);
    setTimeout(() => {
      setCopiedHistoryIndex((current) => (current === index ? null : current));
    }, 1500);
  };

  const handleClearHistory = () => {
    clearGeneratedPasswordHistory();
    setHistoryEntries([]);
  };

  const score = calculatePasswordScore(password);
  const strength = getStrengthLabel(password);

  // Custom descriptions for word list counts in Diceware
  const getDicewareStrengthDescription = (count: number) => {
    const entropyBits = calculateDicewareEntropyBits({
      language: dicewareOptions.language,
      wordCount: count,
      addNumber: dicewareOptions.addNumber,
      addSymbol: dicewareOptions.addSymbol,
    });
    if (entropyBits < 60) return { text: t('passwordGenerator.diceStrength.medium'), color: 'text-brand-secondary' };
    if (entropyBits < 75) return { text: t('passwordGenerator.diceStrength.high'), color: 'text-brand-tertiary' };
    if (entropyBits < 90) return { text: t('passwordGenerator.diceStrength.veryHigh'), color: 'text-brand-tertiary' };
    return { text: t('passwordGenerator.diceStrength.military'), color: 'text-brand-tertiary' };
  };

  const dicewareStatus = getDicewareStrengthDescription(dicewareOptions.wordCount);
  const separatorOptions = [
    { value: 'hyphen', label: t('passwordGenerator.separator.hyphen') },
    { value: 'dot', label: t('passwordGenerator.separator.dot') },
    { value: 'underscore', label: t('passwordGenerator.separator.underscore') },
    { value: 'space', label: t('passwordGenerator.separator.space') },
    { value: 'camel', label: t('passwordGenerator.separator.camel') },
    { value: 'none', label: t('passwordGenerator.separator.none') },
  ] as const;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto pb-6 sm:pb-10" id="password-generator-root">
      {/* Header section */}
      <div className="flex items-center gap-3 mb-1 sm:mb-2" id="generator-header">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center border border-brand-primary/20">
          <KeyRound className="w-5 h-5 text-brand-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold font-display text-on-surface">{t('passwordGenerator.title')}</h2>
          <p className="hidden sm:block text-xs text-on-surface-variant">{t('passwordGenerator.subtitle')}</p>
        </div>
      </div>

      {/* Mode Switches */}
      <div className="flex bg-surface-low p-1.5 rounded-xl border border-outline-variant/10 max-w-md" id="generator-mode-tabs">
        <button
          onClick={() => setMode('character')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            mode === 'character'
              ? 'bg-brand-primary text-brand-on-primary shadow-lg'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-high/40'
          }`}
          id="mode-char-tab"
        >
          <Sliders className="w-4 h-4" />
          <span>{t('passwordGenerator.characterMode')}</span>
        </button>

        <button
          onClick={() => setMode('diceware')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            mode === 'diceware'
              ? 'bg-brand-primary text-brand-on-primary shadow-lg'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-high/40'
          }`}
          id="mode-diceware-tab"
        >
          <BookOpen className="w-4 h-4" />
          <span>{t('passwordGenerator.dicewareMode')}</span>
        </button>
      </div>

      {/* Password display panel */}
      <div className="glass-panel p-4 sm:p-6 rounded-2xl relative overflow-hidden" id="password-display-card">
        <div className="absolute top-0 left-0 w-1 h-full bg-brand-primary"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          <div
            data-testid="password-generator-output"
            className="font-mono text-sm md:text-lg break-all tracking-wide text-on-surface select-all bg-surface-lowest/60 p-3.5 sm:p-4 rounded-xl border border-outline-variant/15 flex-1 min-h-[54px] flex items-center"
          >
            {password ? <ColoredPassword password={password} /> : t('passwordGenerator.empty')}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleGenerate(true)}
              className="p-3.5 rounded-xl bg-surface-container hover:bg-surface-high text-on-surface transition-colors border border-outline-variant/10 flex items-center justify-center cursor-pointer"
              title={t('passwordGenerator.refresh')}
              id="refresh-password-btn"
              data-testid="password-generator-refresh-button"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={handleCopy}
              className={`flex-1 sm:flex-none justify-center px-4 sm:px-6 py-3.5 rounded-xl font-bold flex items-center gap-2 transition-all cursor-pointer ${
                copied
                  ? 'bg-brand-tertiary text-brand-on-tertiary'
                  : 'bg-brand-primary text-brand-on-primary shadow-lg shadow-brand-primary/10 hover:brightness-110'
              }`}
              id="copy-password-btn"
              data-testid="password-generator-copy-button"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5" />
                  <span>{t('passwordGenerator.copied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  <span>{t('passwordGenerator.copy')}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Dynamic Strength visual helper */}
        <div className="mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-outline-variant/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
              {t('passwordGenerator.strengthLevel')}
            </div>
            <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${strength.colorClass}`}>
              {strength.label}
            </span>
          </div>
          <div className="flex-1 max-w-xs flex items-center gap-1">
            <div className="w-full h-2 bg-surface-low rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full bg-gradient-to-r ${
                  score >= 90
                    ? 'bg-brand-tertiary from-emerald-600 to-brand-tertiary shadow-[0_0_8px_rgba(209,233,204,0.3)]'
                    : score >= 70
                    ? 'bg-brand-secondary from-blue-600 to-brand-secondary shadow-[0_0_8px_rgba(172,201,235,0.3)]'
                    : score >= 40
                    ? 'bg-amber-400 from-amber-500 to-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                    : 'bg-brand-error from-red-600 to-brand-error shadow-[0_0_8px_rgba(255,180,171,0.3)]'
                } ${progressWidthClass(score)}`}
              ></div>
            </div>
            <span className="text-xs font-mono font-bold text-on-surface-variant ml-2 whitespace-nowrap tabular-nums shrink-0">
              {formatPercent(score, language)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Settings Body */}
      {mode === 'character' ? (
        /* Character-based Configurations Card */
        <div className="glass-panel p-4 sm:p-6 rounded-2xl space-y-4 sm:space-y-6" id="chars-spec-panel">
          <div className="flex items-center gap-2 mb-2 pb-4 border-b border-outline-variant/10">
            <Sliders className="w-5 h-5 text-on-surface-variant" />
            <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider">{t('passwordGenerator.characterSettings')}</h3>
          </div>

          {/* Slider for Password Length */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-on-surface">{t('passwordGenerator.length')}</span>
              <span className="font-mono text-base font-bold text-brand-primary bg-surface-lowest px-3 py-1 rounded-lg border border-outline-variant/10">
                {options.length}
              </span>
            </div>
            <input
              type="range"
              min="6"
              max="64"
              value={options.length}
              onChange={(e) => setOptions({ ...options, length: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-surface-low rounded-lg appearance-none cursor-pointer accent-brand-primary"
            />
            <div className="flex justify-between text-[11px] text-on-surface-variant/40 font-mono">
              <span>6 {t('passwordGenerator.characters')}</span>
              <span>64 {t('passwordGenerator.characters')}</span>
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-1 sm:pt-2">
            {/* Upper letters */}
            <label className="flex items-center justify-between p-3 sm:p-4 bg-surface-low hover:bg-surface-container rounded-xl border border-outline-variant/10 cursor-pointer transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{t('passwordGenerator.uppercase')}</span>
                <span className="text-xs text-on-surface-variant font-mono">A-Z</span>
              </div>
              <input
                type="checkbox"
                checked={options.uppercase}
                onChange={(e) => setOptions({ ...options, uppercase: e.target.checked })}
                className="w-5 h-5 text-brand-primary bg-surface-low border-outline-variant/30 rounded focus:ring-brand-primary/20 accent-brand-primary cursor-pointer"
              />
            </label>

            {/* Lower letters */}
            <label className="flex items-center justify-between p-3 sm:p-4 bg-surface-low hover:bg-surface-container rounded-xl border border-outline-variant/10 cursor-pointer transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{t('passwordGenerator.lowercase')}</span>
                <span className="text-xs text-on-surface-variant font-mono">a-z</span>
              </div>
              <input
                type="checkbox"
                checked={options.lowercase}
                onChange={(e) => setOptions({ ...options, lowercase: e.target.checked })}
                className="w-5 h-5 text-brand-primary bg-surface-low border-outline-variant/30 rounded focus:ring-brand-primary/20 accent-brand-primary cursor-pointer"
              />
            </label>

            {/* Digits */}
            <label className="flex items-center justify-between p-3 sm:p-4 bg-surface-low hover:bg-surface-container rounded-xl border border-outline-variant/10 cursor-pointer transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{t('passwordGenerator.numbers')}</span>
                <span className="text-xs text-on-surface-variant font-mono">0-9</span>
              </div>
              <input
                type="checkbox"
                checked={options.numbers}
                onChange={(e) => setOptions({ ...options, numbers: e.target.checked })}
                className="w-5 h-5 text-brand-primary bg-surface-low border-outline-variant/30 rounded focus:ring-brand-primary/20 accent-brand-primary cursor-pointer"
              />
            </label>

            {/* Symbols */}
            <label className="flex items-center justify-between p-3 sm:p-4 bg-surface-low hover:bg-surface-container rounded-xl border border-outline-variant/10 cursor-pointer transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{t('passwordGenerator.symbols')}</span>
                <span className="text-xs text-on-surface-variant font-mono">@#$%!*</span>
              </div>
              <input
                type="checkbox"
                checked={options.symbols}
                onChange={(e) => setOptions({ ...options, symbols: e.target.checked })}
                className="w-5 h-5 text-brand-primary bg-surface-low border-outline-variant/30 rounded focus:ring-brand-primary/20 accent-brand-primary cursor-pointer"
              />
            </label>

            {/* Exclude ambiguous characters */}
            <label className="flex items-center justify-between p-3 sm:p-4 bg-surface-low hover:bg-surface-container rounded-xl border border-outline-variant/10 cursor-pointer transition-colors sm:col-span-2">
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{t('passwordGenerator.excludeAmbiguous')}</span>
                <span className="text-xs text-on-surface-variant font-mono">O / 0, I / l / 1 / |</span>
              </div>
              <input
                type="checkbox"
                data-testid="generator-exclude-ambiguous-checkbox"
                checked={excludeAmbiguous}
                onChange={(e) => setExcludeAmbiguous(e.target.checked)}
                className="w-5 h-5 text-brand-primary bg-surface-low border-outline-variant/30 rounded focus:ring-brand-primary/20 accent-brand-primary cursor-pointer"
              />
            </label>
          </div>

          {options.symbols && (
            <div className="pt-1 space-y-1.5">
              <label
                htmlFor="generator-custom-symbols"
                className="block text-xs font-semibold text-on-surface-variant"
              >
                {t('passwordGenerator.customSymbols')}
              </label>
              <input
                id="generator-custom-symbols"
                data-testid="generator-custom-symbols-input"
                type="text"
                value={customSymbols}
                onChange={(e) => setCustomSymbols(e.target.value)}
                placeholder={t('passwordGenerator.customSymbolsPlaceholder')}
                className="w-full bg-surface-lowest border border-outline-variant/20 rounded-xl px-3.5 py-2 text-xs font-mono text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-primary/35"
              />
            </div>
          )}
        </div>
      ) : (
        /* Diceware configurations Card */
        <div className="glass-panel p-4 sm:p-6 rounded-2xl space-y-4 sm:space-y-6" id="diceware-spec-panel">
          {/* Section banner */}
          <div className="flex items-center justify-between mb-2 pb-4 border-b border-outline-variant/10">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-tertiary" />
              <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider">{t('passwordGenerator.dicewareSettings')}</h3>
            </div>
            <div className={`text-xs font-bold ${dicewareStatus.color}`}>
              {dicewareStatus.text}
            </div>
          </div>

          {/* Word list count slider */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-on-surface">{t('passwordGenerator.wordCount')}</span>
              <span className="font-mono text-base font-bold text-brand-tertiary bg-surface-lowest px-3 py-1 rounded-lg border border-outline-variant/10">
                {dicewareOptions.wordCount} {t('passwordGenerator.word')}
              </span>
            </div>
            <input
              type="range"
              min="4"
              max="10"
              value={dicewareOptions.wordCount}
              onChange={(e) => setDicewareOptions({ ...dicewareOptions, wordCount: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-surface-low rounded-lg appearance-none cursor-pointer accent-brand-tertiary"
            />
            <div className="flex justify-between text-[11px] text-on-surface-variant/40 font-mono">
              <span>{t('passwordGenerator.wordsEasy')}</span>
              <span>{t('passwordGenerator.wordsStrong')}</span>
            </div>
          </div>

          {/* Separator Selection */}
          <div className="space-y-2">
            <span className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">{t('passwordGenerator.separatorType')}</span>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2" id="separator-selection-grid">
              {separatorOptions.map((sep) => {
                const isSelected = dicewareOptions.separator === sep.value;
                return (
                  <button
                    key={sep.value}
                    type="button"
                    onClick={() => setDicewareOptions({ ...dicewareOptions, separator: sep.value })}
                    className={`py-2 px-1 text-[11px] font-semibold text-center border rounded-lg transition-all cursor-pointer ${
                      isSelected
                        ? 'border-brand-tertiary bg-brand-tertiary/10 text-brand-tertiary shadow-sm'
                        : 'border-outline-variant/10 bg-surface-low hover:bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {sep.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Diceware Advanced Settings Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-1" id="diceware-options-checkboxes">
            {/* Wordlist Language */}
            <div className="flex items-center justify-between p-3 sm:p-4 bg-surface-low rounded-xl border border-outline-variant/10">
              <div className="flex flex-col">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-brand-primary" />
                  <span>{t('passwordGenerator.wordDictionary')}</span>
                </span>
                <span className="text-xs text-on-surface-variant">{t('passwordGenerator.wordDictionaryHelp')}</span>
              </div>
              <div className="flex border border-outline-variant/10 rounded-lg overflow-hidden p-0.5 bg-surface-lowest">
                <button
                  type="button"
                  onClick={() => setDicewareOptions({ ...dicewareOptions, language: 'tr' })}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    dicewareOptions.language === 'tr'
                      ? 'bg-brand-primary text-brand-on-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  TR
                </button>
                <button
                  type="button"
                  onClick={() => setDicewareOptions({ ...dicewareOptions, language: 'en' })}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    dicewareOptions.language === 'en'
                      ? 'bg-brand-primary text-brand-on-primary'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  EN
                </button>
              </div>
            </div>

            {/* Capitalize First letters check */}
            <label className="flex items-center justify-between p-3 sm:p-4 bg-surface-low hover:bg-surface-container rounded-xl border border-outline-variant/10 cursor-pointer transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{t('passwordGenerator.capitalize')}</span>
                <span className="text-xs text-on-surface-variant">{t('passwordGenerator.capitalizeHelp')}</span>
              </div>
              <input
                type="checkbox"
                checked={dicewareOptions.capitalize}
                onChange={(e) => setDicewareOptions({ ...dicewareOptions, capitalize: e.target.checked })}
                className="w-5 h-5 text-brand-tertiary bg-surface-low border-outline-variant/30 rounded focus:ring-brand-tertiary/20 accent-brand-tertiary cursor-pointer"
              />
            </label>

            {/* Add Random Numbers */}
            <label className="flex items-center justify-between p-3 sm:p-4 bg-surface-low hover:bg-surface-container rounded-xl border border-outline-variant/10 cursor-pointer transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <Hash className="w-4 h-4 text-brand-secondary" />
                  <span>{t('passwordGenerator.addNumber')}</span>
                </span>
                <span className="text-xs text-on-surface-variant">{t('passwordGenerator.addNumberHelp')}</span>
              </div>
              <input
                type="checkbox"
                checked={dicewareOptions.addNumber}
                onChange={(e) => setDicewareOptions({ ...dicewareOptions, addNumber: e.target.checked })}
                className="w-5 h-5 text-brand-tertiary bg-surface-low border-outline-variant/30 rounded focus:ring-brand-tertiary/20 accent-brand-tertiary cursor-pointer"
              />
            </label>

            {/* Add Random Symbols */}
            <label className="flex items-center justify-between p-3 sm:p-4 bg-surface-low hover:bg-surface-container rounded-xl border border-outline-variant/10 cursor-pointer transition-colors">
              <div className="flex flex-col font-sans">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <Minimize2 className="w-4 h-4 text-brand-tertiary" />
                  <span>{t('passwordGenerator.addSymbol')}</span>
                </span>
                <span className="text-xs text-on-surface-variant">{t('passwordGenerator.addSymbolHelp')}</span>
              </div>
              <input
                type="checkbox"
                checked={dicewareOptions.addSymbol}
                onChange={(e) => setDicewareOptions({ ...dicewareOptions, addSymbol: e.target.checked })}
                className="w-5 h-5 text-brand-tertiary bg-surface-low border-outline-variant/30 rounded focus:ring-brand-tertiary/20 accent-brand-tertiary cursor-pointer"
              />
            </label>
          </div>

          {/* Diceware informational secure helper */}
          <div className="flex gap-3 bg-brand-primary/5 border border-brand-primary/10 p-4 rounded-xl items-start">
            <Lock className="w-5 h-5 text-brand-primary shrink-0 mt-0.5" />
            <div className="text-xs text-on-surface-variant leading-relaxed">
              <b className="text-on-surface block mb-0.5">{t('passwordGenerator.dicewareInfoTitle')}</b>
              {t('passwordGenerator.dicewareInfoPrefix')} <b>{t('passwordGenerator.dicewareInfoEasy')}</b> {t('passwordGenerator.dicewareInfoMiddle')} <b>{t('passwordGenerator.dicewareInfoEntropy')}</b>. {t('passwordGenerator.dicewareInfoSuffix')}
            </div>
          </div>
        </div>
      )}

      {/* Session-scoped Generated Password History */}
      <div className="glass-panel rounded-2xl overflow-hidden" id="generator-history-card">
        <button
          type="button"
          data-testid="generator-history-toggle"
          onClick={() => setIsHistoryOpen((open) => !open)}
          className="w-full flex items-center justify-between px-4 sm:px-6 py-3.5 text-left hover:bg-surface-high/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <History className="w-4 h-4 text-brand-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface">
              {t('passwordGenerator.history.title')}
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-full bg-surface-low border border-outline-variant/20 text-on-surface-variant tabular-nums">
              {historyEntries.length}
            </span>
          </div>
          {isHistoryOpen ? (
            <ChevronUp className="w-4 h-4 text-on-surface-variant" />
          ) : (
            <ChevronDown className="w-4 h-4 text-on-surface-variant" />
          )}
        </button>

        {isHistoryOpen && (
          <div
            data-testid="generator-history-panel"
            className="px-4 sm:px-6 pb-4 pt-1 border-t border-outline-variant/10 space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-on-surface-variant">
                {t('passwordGenerator.history.subtitle')}
              </p>
              {historyEntries.length > 0 && (
                <button
                  type="button"
                  data-testid="generator-history-clear-button"
                  onClick={handleClearHistory}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-error hover:underline cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('passwordGenerator.history.clear')}</span>
                </button>
              )}
            </div>

            {historyEntries.length === 0 ? (
              <p className="text-xs text-on-surface-variant/70 italic py-2">
                {t('passwordGenerator.history.empty')}
              </p>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {historyEntries.map((entry, idx) => (
                  <div
                    key={`${entry.createdAt}-${idx}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-surface-lowest border border-outline-variant/15"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs text-on-surface truncate">
                        <ColoredPassword password={entry.password} />
                      </div>
                      <span className="text-[10px] text-on-surface-variant font-mono">
                        {entry.mode === 'diceware'
                          ? t('passwordGenerator.dicewareMode')
                          : t('passwordGenerator.characterMode')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyHistoryEntry(entry.password, idx)}
                      className="p-1.5 rounded-lg bg-surface-low hover:bg-surface-high text-on-surface-variant hover:text-brand-primary border border-outline-variant/15 transition-colors cursor-pointer shrink-0"
                      title={t('passwordGenerator.copy')}
                    >
                      {copiedHistoryIndex === idx ? (
                        <Check className="w-3.5 h-3.5 text-brand-tertiary" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
