import { useSyncExternalStore } from 'react';
import { AlertTriangle, Fingerprint } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import {
  formatArgon2MemoryComparison,
  getArgon2DegradationInfo,
  subscribeArgon2Degradation,
} from '../lib/argon2id';

interface CryptoShieldPanelProps {
  compact?: boolean;
}

export default function CryptoShieldPanel({ compact = false }: CryptoShieldPanelProps) {
  const { t } = useLanguage();

  // D2: Surface KDF memory degradation to the user instead of logging it silently.
  const degradation = useSyncExternalStore(subscribeArgon2Degradation, getArgon2DegradationInfo);

  const degradationAlert = degradation ? (
    <div
      role="alert"
      className="mt-3 rounded-lg border border-brand-secondary/35 bg-brand-secondary/10 p-3 text-xs text-on-surface-variant leading-relaxed"
    >
      <div className="flex items-center gap-1.5 font-bold text-brand-secondary">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>{t('dashboard.crypto.degradedTitle')}</span>
      </div>
      <p className="mt-1">{t('dashboard.crypto.degradedDesc')}</p>
      <div className="mt-2 flex items-center justify-between font-mono text-[11px]">
        <span>
          Argon2id: {formatArgon2MemoryComparison(degradation)}
        </span>
        <span className={degradation.writeBlocked ? 'font-bold text-brand-error' : 'font-bold text-brand-secondary'}>
          {degradation.writeBlocked
            ? t('dashboard.crypto.degradedWritesBlocked')
            : t('dashboard.crypto.degradedReducedSecurity')}
        </span>
      </div>
    </div>
  ) : null;

  if (compact) {
    return (
      <div className="surface-card rounded-xl px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2 text-on-surface-variant font-medium">
            <Fingerprint className="w-3.5 h-3.5 text-brand-primary shrink-0" />
            <span className="font-semibold text-on-surface">{t('dashboard.crypto.title')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
            <span className="text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded border border-brand-primary/20 font-semibold">
              {t('dashboard.crypto.engineValue')}
            </span>
            <span className="text-brand-tertiary bg-brand-tertiary/10 px-2 py-0.5 rounded border border-brand-tertiary/20 font-semibold">
              {t('dashboard.crypto.clientSecurityValue')}
            </span>
            <span className="text-brand-secondary bg-brand-secondary/10 px-2 py-0.5 rounded border border-brand-secondary/20 font-semibold">
              {t('dashboard.crypto.hashDepthValue')}
            </span>
          </div>
        </div>
        {degradationAlert}
      </div>
    );
  }

  return (
    <div className="surface-panel rounded-xl p-5 flex flex-col justify-between gap-4">
      <div>
        <div className="flex items-center justify-between border-b border-outline-variant/15 pb-3 mb-3">
          <h3 className="font-display text-xs font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-2">
            <Fingerprint className="w-4 h-4 text-brand-primary" />
            <span>{t('dashboard.crypto.title')}</span>
          </h3>
          <span className="text-[11px] text-on-surface-variant font-mono">{t('dashboard.crypto.statusActive')}</span>
        </div>
        <div className="space-y-3 text-xs text-on-surface-variant leading-relaxed">
          <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
            <span className="font-semibold text-on-surface">{t('dashboard.crypto.engine')}</span>
            <span className="font-mono text-[11px] text-brand-primary bg-brand-primary/10 px-2.5 py-0.5 rounded border border-brand-primary/25 font-bold">
              {t('dashboard.crypto.engineValue')}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
            <span className="font-semibold text-on-surface">{t('dashboard.crypto.clientSecurity')}</span>
            <span className="font-mono text-[11px] text-brand-tertiary bg-brand-tertiary/10 px-2.5 py-0.5 rounded border border-brand-tertiary/25 font-bold">
              {t('dashboard.crypto.clientSecurityValue')}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
            <span className="font-semibold text-on-surface">{t('dashboard.crypto.hashDepth')}</span>
            <span className="font-mono text-[11px] text-brand-secondary bg-brand-secondary/10 px-2.5 py-0.5 rounded border border-brand-secondary/25 font-bold">
              {t('dashboard.crypto.hashDepthValue')}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-on-surface">{t('dashboard.crypto.securityStatus')}</span>
            <span className="font-mono text-[11px] text-brand-tertiary font-bold bg-brand-tertiary/10 px-2.5 py-0.5 rounded border border-brand-tertiary/25 uppercase tracking-wider">
              {t('dashboard.crypto.securityStatusValue')}
            </span>
          </div>
        </div>
        {degradationAlert}
      </div>
    </div>
  );
}
