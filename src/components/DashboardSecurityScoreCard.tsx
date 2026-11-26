import { ArrowUpRight, ShieldCheck } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations';
import { formatPercent } from '../lib/formatters';
import { AUDIT_CRITICAL_THRESHOLD, AUDIT_EXCELLENT_THRESHOLD } from '../lib/security';
import type { AuditReport } from '../types';

interface DashboardSecurityScoreCardProps {
  auditReport: AuditReport;
  activeItemCount: number;
  onOpenAudit?: () => void;
}

function getScoreTone(score: number): string {
  if (score >= AUDIT_EXCELLENT_THRESHOLD) return 'text-brand-tertiary';
  if (score >= AUDIT_CRITICAL_THRESHOLD) return 'text-brand-secondary';
  return 'text-brand-error';
}

function getScoreTitleKey(score: number): TranslationKey {
  if (score >= AUDIT_EXCELLENT_THRESHOLD) return 'dashboard.score.secureTitle';
  if (score >= AUDIT_CRITICAL_THRESHOLD) return 'dashboard.score.mediumTitle';
  return 'dashboard.score.criticalTitle';
}

function getScoreDescriptionKey(score: number): TranslationKey {
  return score >= AUDIT_EXCELLENT_THRESHOLD ? 'dashboard.score.secureDescription' : 'dashboard.score.riskyDescription';
}

export default function DashboardSecurityScoreCard({
  auditReport,
  activeItemCount,
  onOpenAudit,
}: DashboardSecurityScoreCardProps) {
  const { language, t } = useLanguage();

  const metricsContent = (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-3.5 border-t border-outline-variant/15 text-center">
      <div className="space-y-0.5">
        <p className="text-[11px] text-on-surface-variant truncate">{t('dashboard.score.savedItems')}</p>
        <p className="text-sm font-bold text-on-surface font-mono tabular-nums">{activeItemCount}</p>
      </div>
      <div className="space-y-0.5 border-l border-outline-variant/15">
        <p className="text-[11px] text-on-surface-variant truncate">{t('dashboard.score.weakPasswords')}</p>
        <p className={`text-sm font-bold font-mono tabular-nums ${auditReport.weakCount > 0 ? 'text-brand-error' : 'text-brand-tertiary'}`}>
          {auditReport.weakCount}
        </p>
      </div>
      <div className="space-y-0.5 border-l border-outline-variant/15 font-mono">
        <p className="text-[11px] text-on-surface-variant font-sans truncate">{t('dashboard.score.reusedPasswords')}</p>
        <p className={`text-sm font-bold tabular-nums ${auditReport.reusedCount > 0 ? 'text-brand-secondary' : 'text-brand-tertiary'}`}>
          {auditReport.reusedCount}
        </p>
      </div>
      <div className="space-y-0.5 border-l border-outline-variant/15 font-mono">
        <p className="text-[11px] text-on-surface-variant font-sans truncate">{t('dashboard.score.oldPasswords')}</p>
        <p className={`text-sm font-bold tabular-nums ${(auditReport.oldPasswordCount ?? 0) > 0 ? 'text-brand-secondary' : 'text-brand-tertiary'}`}>
          {auditReport.oldPasswordCount ?? 0}
        </p>
      </div>
      <div className="space-y-0.5 border-l border-outline-variant/15 font-mono col-span-2 sm:col-span-1">
        <p className="text-[11px] text-on-surface-variant font-sans truncate">{t('dashboard.score.missingTotp')}</p>
        <p className={`text-sm font-bold tabular-nums ${(auditReport.missingTotpCount ?? 0) > 0 ? 'text-brand-secondary' : 'text-brand-tertiary'}`}>
          {auditReport.missingTotpCount ?? 0}
        </p>
      </div>
    </div>
  );

  return (
    <div className="md:col-span-7 surface-panel rounded-xl p-5 flex flex-col justify-between gap-4 relative overflow-hidden group hover:border-brand-primary/20 transition-all">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wider text-brand-tertiary uppercase flex items-center gap-1.5 bg-brand-tertiary/10 px-2.5 py-1 rounded-md w-fit">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{t('dashboard.score.label')}</span>
        </span>
        {onOpenAudit ? (
          <button
            type="button"
            data-testid="dashboard-score-audit-link"
            onClick={onOpenAudit}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-on-surface-variant hover:text-brand-primary transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 rounded px-1.5 py-0.5"
          >
            <span>{t('nav.audit')}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="text-[11px] text-on-surface-variant font-mono">{t('dashboard.score.crypto')}</span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-5 my-1">
        <div className="relative w-24 h-24 shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
            <path
              className="text-surface-high stroke-current"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              strokeWidth="3.2"
            />
            <path
              className={`${getScoreTone(auditReport.score)} stroke-current transition-all duration-500`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              strokeDasharray={`${auditReport.score}, 100`}
              strokeLinecap="round"
              strokeWidth="3.2"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center font-display">
            <span className="text-xl font-bold font-mono text-on-surface tabular-nums">{formatPercent(auditReport.score, language)}</span>
            <span className="text-[9px] text-on-surface-variant/75 tracking-widest uppercase">{t('dashboard.score.power')}</span>
          </div>
        </div>

        <div className="space-y-1.5 text-center sm:text-left">
          <h3 className="font-display font-bold text-base text-on-surface">{t(getScoreTitleKey(auditReport.score))}</h3>
          <p className="text-on-surface-variant text-xs leading-relaxed">{t(getScoreDescriptionKey(auditReport.score))}</p>
        </div>
      </div>

      {onOpenAudit ? (
        <button
          type="button"
          data-testid="dashboard-score-metrics-button"
          onClick={onOpenAudit}
          className="w-full text-left rounded-lg hover:bg-surface-high/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
          title={t('nav.audit')}
        >
          {metricsContent}
        </button>
      ) : (
        metricsContent
      )}
    </div>
  );
}
