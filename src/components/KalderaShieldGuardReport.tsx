import { AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { APP_SECURITY_BRAND } from '../lib/branding';
import { AUDIT_EXCELLENT_THRESHOLD } from '../lib/security';
import type { AuditReport } from '../types';

interface KalderaShieldGuardReportProps {
  auditReport: AuditReport;
  onOpenAudit?: () => void;
}

export default function KalderaShieldGuardReport({ auditReport, onOpenAudit }: KalderaShieldGuardReportProps) {
  const { t } = useLanguage();
  const isSecure = auditReport.score >= AUDIT_EXCELLENT_THRESHOLD;

  const content = (
    <>
      <div className="icon-tile bg-surface-low shrink-0">
        {isSecure ? (
          <ShieldCheck className="w-5 h-5 text-brand-tertiary" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-brand-secondary" />
        )}
      </div>
      <div className="space-y-0.5 flex-1 min-w-0">
        <h4 className="font-bold text-on-surface">{APP_SECURITY_BRAND} {t('dashboard.guard.titleSuffix')}</h4>
        <p className="text-on-surface-variant text-xs leading-relaxed">
          {isSecure
            ? t('dashboard.guard.secureDescription')
            : `${t('dashboard.guard.riskyPrefix')} ${auditReport.weakCount} ${t('dashboard.guard.weakSuffix')} ${t('dashboard.guard.connector')} ${auditReport.reusedCount} ${t('dashboard.guard.reusedSuffix')}`}
        </p>
      </div>
      {!isSecure && onOpenAudit && (
        <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-brand-secondary shrink-0">
          <span>{t('nav.audit')}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </span>
      )}
    </>
  );

  if (!isSecure && onOpenAudit) {
    return (
      <button
        type="button"
        onClick={onOpenAudit}
        className="w-full text-left surface-card surface-card-hover rounded-xl px-4 py-3 flex items-center gap-3.5 text-xs border border-brand-secondary/25 bg-brand-secondary/5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary/40"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="surface-card rounded-xl px-4 py-3 flex items-center gap-3.5 text-xs">
      {content}
    </div>
  );
}
