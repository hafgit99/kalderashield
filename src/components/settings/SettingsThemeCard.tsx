import { Palette, Check, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeMode, type ThemePalette } from '../../context/ThemeContext';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations';

export function SettingsThemeCard() {
  const { themeMode, themePalette, setThemeMode, setThemePalette } = useTheme();
  const { t } = useLanguage();

  const modes: { key: ThemeMode; icon: typeof Moon; label: string }[] = [
    { key: 'dark', icon: Moon, label: t('settings.theme.modeDark', 'Dark') },
    { key: 'light', icon: Sun, label: t('settings.theme.modeLight', 'Light') },
  ];

  const palettes: { key: ThemePalette; colorClass: string; nameKey: TranslationKey }[] = [
    { key: 'emerald', colorClass: 'bg-emerald-500 border-emerald-400', nameKey: 'settings.theme.paletteEmerald' },
    { key: 'blue', colorClass: 'bg-sky-500 border-sky-400', nameKey: 'settings.theme.paletteBlue' },
    { key: 'purple', colorClass: 'bg-purple-500 border-purple-400', nameKey: 'settings.theme.palettePurple' },
    { key: 'orange', colorClass: 'bg-orange-500 border-orange-400', nameKey: 'settings.theme.paletteOrange' },
    { key: 'red', colorClass: 'bg-red-500 border-red-400', nameKey: 'settings.theme.paletteRed' },
  ];

  return (
    <section
      data-testid="theme-settings-card"
      className="glass-panel p-4 sm:p-6 rounded-2xl border border-outline-variant/15 space-y-4 sm:space-y-5"
    >
      <div className="space-y-1.5">
        <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
          <Palette className="w-4 h-4 text-brand-primary" />
          <span>{t('settings.theme.title')}</span>
        </h3>
        <p className="text-xs text-on-surface-variant leading-relaxed">
          {t('settings.theme.description')}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <span className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide">
            {t('settings.theme.modeLabel', 'Theme Mode')}
          </span>
          <div className="inline-flex bg-surface-low p-1 rounded-xl border border-outline-variant/20 gap-1">
            {modes.map((mode) => {
              const Icon = mode.icon;
              const isActive = themeMode === mode.key;
              return (
                <button
                  key={mode.key}
                  type="button"
                  data-testid={`theme-mode-${mode.key}`}
                  onClick={() => setThemeMode(mode.key)}
                  aria-pressed={isActive}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-brand-primary text-brand-on-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-high/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wide">
            {t('settings.theme.paletteLabel')}
          </span>
          <div className="flex flex-wrap items-center gap-3 py-1">
            {palettes.map((palette) => {
              const isActive = themePalette === palette.key;
              return (
                <button
                  key={palette.key}
                  type="button"
                  data-testid={`theme-palette-${palette.key}`}
                  onClick={() => setThemePalette(palette.key)}
                  title={t(palette.nameKey)}
                  className={`w-8 h-8 rounded-full cursor-pointer flex items-center justify-center border-2 transition-all relative hover:scale-110 active:scale-95 ${palette.colorClass} ${
                    isActive
                      ? 'ring-2 ring-brand-primary ring-offset-2 ring-offset-surface-low scale-105 border-white'
                      : 'border-transparent opacity-80 hover:opacity-100'
                  }`}
                >
                  {isActive && <Check className="w-4 h-4 text-white drop-shadow-md" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
