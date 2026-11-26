/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  ArrowRight,
  User,
  WifiOff,
  Clock,
  Link,
  TrendingUp,
  RefreshCw,
  HardDrive,
  X,
  Copy,
  KeyRound,
} from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { formatPercent } from '../lib/formatters';
import type { VaultItem } from '../types';
import {
  AUDIT_CRITICAL_THRESHOLD,
  AUDIT_EXCELLENT_THRESHOLD,
  PASSWORD_OLD_AGE_DAYS,
  PASSWORD_SECURE_SCORE_THRESHOLD,
  PASSWORD_WEAK_SCORE_THRESHOLD,
  calculatePasswordScore,
  getAuditScoreHistory,
  getItemPasswordAgeInDays,
  isUnsecureHttpUrl,
  itemNeedsTwoFactor,
  runVaultAudit,
  saveAuditScoreToHistory,
} from '../lib/security';
import {
  checkPasswordAgainstHibp,
  clearHibpSessionCache,
  getCachedHibpSessionScan,
  getLocalHibpFilePath,
  isHibpCheckEnabled,
  isLocalHibpSupported,
  scanVaultItemsAgainstHibp,
  scanVaultItemsAgainstLocalHibp,
  selectLocalHibpFile,
  setCachedHibpSessionScan,
  setHibpCheckEnabled,
  setLocalHibpFilePath,
} from '../lib/hibp';

interface SecurityAuditProps {
  items: VaultItem[];
  onSelectItem: (item: VaultItem) => void;
}

type AuditFilterKey = 'all' | 'pwned' | 'weak' | 'reused' | 'totp' | 'old' | 'http';

const EMPTY_PWNED_MAP = new Map<string, number>();

function computeItemsPasswordFingerprint(items: VaultItem[]): string {
  let h1 = 0x811c9dc5 >>> 0;
  let count = 0;
  for (const item of items) {
    const pw = item.password || '';
    if (!pw) continue;
    count++;
    const combined = `${item.id}:${pw.length}:${pw}`;
    for (let i = 0; i < combined.length; i++) {
      h1 = Math.imul(h1 ^ combined.charCodeAt(i), 0x01000193) >>> 0;
    }
  }
  return `${count}_${h1.toString(36)}`;
}

export default function SecurityAudit({ items, onSelectItem }: SecurityAuditProps) {
  const { language, t } = useLanguage();
  const [hibpEnabled, setHibpEnabled] = React.useState<boolean>(() => isHibpCheckEnabled());
  const [localHibpPath, setLocalHibpPath] = React.useState<string | null>(() => getLocalHibpFilePath());
  const [localHibpError, setLocalHibpError] = React.useState<string | null>(null);
  const itemsPasswordFingerprint = React.useMemo(() => computeItemsPasswordFingerprint(items), [items]);
  const breachSourceKey = localHibpPath ? `local:${localHibpPath}` : 'online';
  const isBreachCheckActive = Boolean(localHibpPath) || hibpEnabled;

  const [pwnedByItemId, setPwnedByItemId] = React.useState<Map<string, number>>(() => {
    if (!isBreachCheckActive) return EMPTY_PWNED_MAP;
    return getCachedHibpSessionScan(breachSourceKey, itemsPasswordFingerprint)?.pwnedByItemId ?? EMPTY_PWNED_MAP;
  });
  const [hibpStatus, setHibpStatus] = React.useState<'idle' | 'checking' | 'complete' | 'unavailable'>(() => {
    if (!isBreachCheckActive) return 'idle';
    return getCachedHibpSessionScan(breachSourceKey, itemsPasswordFingerprint)?.status ?? 'idle';
  });
  const [hibpProgress, setHibpProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [scanNonce, setScanNonce] = React.useState(0);
  const [activeFilter, setActiveFilter] = React.useState<AuditFilterKey>('all');

  const itemsRef = React.useRef(items);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const localHibpSupported = isLocalHibpSupported();

  const effectivePwnedByItemId = isBreachCheckActive ? pwnedByItemId : EMPTY_PWNED_MAP;
  const effectiveHibpStatus = isBreachCheckActive ? hibpStatus : 'idle';
  const effectiveHibpProgress = isBreachCheckActive ? hibpProgress : null;

  const pwnedItemIds = React.useMemo(
    () => new Set(effectivePwnedByItemId.keys()),
    [effectivePwnedByItemId],
  );

  // Pure memoized audit calculation (no localStorage write during render)
  const audit = React.useMemo(
    () => runVaultAudit(items, { pwnedItemIds, persistHistory: false }),
    [items, pwnedItemIds],
  );

  React.useEffect(() => {
    if (items.length > 0) {
      saveAuditScoreToHistory(audit.score);
    }
  }, [audit.score, items.length]);

  const handleToggleHibp = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !hibpEnabled;
    setHibpEnabled(next);
    setHibpCheckEnabled(next);
    setLocalHibpError(null);
    if (!next && !localHibpPath) {
      setPwnedByItemId(EMPTY_PWNED_MAP);
      setHibpProgress(null);
      setHibpStatus('idle');
      if (activeFilter === 'pwned') setActiveFilter('all');
    } else if (next) {
      setScanNonce((n) => n + 1);
    }
  };

  const handleSelectLocalHibp = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalHibpError(null);
    try {
      const selected = await selectLocalHibpFile();
      if (!selected) return;
      setLocalHibpFilePath(selected.path);
      setLocalHibpPath(selected.path);
      setScanNonce((n) => n + 1);
    } catch {
      setLocalHibpError(t('securityAudit.hibpLocalError'));
    }
  };

  const handleClearLocalHibp = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLocalHibpFilePath(null);
    setLocalHibpPath(null);
    setLocalHibpError(null);
    if (!hibpEnabled) {
      setPwnedByItemId(EMPTY_PWNED_MAP);
      setHibpProgress(null);
      setHibpStatus('idle');
      if (activeFilter === 'pwned') setActiveFilter('all');
    } else {
      setScanNonce((n) => n + 1);
    }
  };

  const handleManualRescan = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isBreachCheckActive || effectiveHibpStatus === 'checking') return;
    setLocalHibpError(null);
    clearHibpSessionCache();
    setScanNonce((n) => n + 1);
  };

  React.useEffect(() => {
    if (!isBreachCheckActive) return undefined;

    const scanItems = itemsRef.current
      .filter((item) => Boolean(item.password))
      .map((item) => ({ id: item.id, password: item.password || '' }));

    const controller = new AbortController();

    (async () => {
      if (scanItems.length === 0) {
        if (!controller.signal.aborted) {
          setPwnedByItemId(EMPTY_PWNED_MAP);
          setHibpProgress(null);
          setHibpStatus('idle');
        }
        return;
      }

      const cachedScan = getCachedHibpSessionScan(breachSourceKey, itemsPasswordFingerprint);
      if (cachedScan) {
        if (!controller.signal.aborted) {
          setPwnedByItemId(cachedScan.pwnedByItemId);
          setHibpProgress(null);
          setHibpStatus(cachedScan.status);
        }
        return;
      }

      if (!controller.signal.aborted) {
        setHibpStatus('checking');
        setHibpProgress(null);
      }

      const scanResult = localHibpPath
        ? await scanVaultItemsAgainstLocalHibp(localHibpPath, scanItems, { signal: controller.signal })
        : await scanVaultItemsAgainstHibp(scanItems, {
          signal: controller.signal,
          checkPassword: checkPasswordAgainstHibp,
          useSessionCache: true,
          onProgress: (done, total) => {
            if (!controller.signal.aborted) {
              setHibpProgress({ done, total });
            }
          },
        });

      if (!controller.signal.aborted && scanResult.status !== 'aborted') {
        const finalStatus = scanResult.status === 'unavailable' ? 'unavailable' : 'complete';
        setCachedHibpSessionScan(breachSourceKey, itemsPasswordFingerprint, finalStatus, scanResult.pwnedByItemId);
        setPwnedByItemId(scanResult.pwnedByItemId);
        setHibpProgress(null);
        setHibpStatus(finalStatus);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [isBreachCheckActive, localHibpPath, breachSourceKey, scanNonce, itemsPasswordFingerprint]);

  // Single memoized O(N) classification using Map/Set (prototype-safe)
  const {
    weakItems,
    weakScoreById,
    reusedItems,
    reusedGroups,
    pwnedItems,
    secureItems,
    missingTotpItems,
    oldPasswordItems,
    unsecureHttpItems,
  } = React.useMemo(() => {
    const passwordGroups = new Map<string, VaultItem[]>();
    for (const item of items) {
      const pw = item.password || '';
      if (!pw) continue;
      const group = passwordGroups.get(pw);
      if (group) {
        group.push(item);
      } else {
        passwordGroups.set(pw, [item]);
      }
    }

    const reusedGroupList: VaultItem[][] = [];
    const reusedIds = new Set<string>();
    for (const group of passwordGroups.values()) {
      if (group.length > 1) {
        reusedGroupList.push(group);
        for (const item of group) {
          reusedIds.add(item.id);
        }
      }
    }

    const weak: VaultItem[] = [];
    const weakScores = new Map<string, number>();
    const reused: VaultItem[] = [];
    const pwned: VaultItem[] = [];
    const secure: VaultItem[] = [];
    const missingTotp: VaultItem[] = [];
    const oldPw: VaultItem[] = [];
    const httpOnly: VaultItem[] = [];

    for (const item of items) {
      const pw = item.password || '';
      const isPasswordItem = item.category === 'login' || pw.length > 0;
      const isReused = reusedIds.has(item.id);
      const isPwned = pwnedItemIds.has(item.id);

      if (isReused) reused.push(item);
      if (isPwned) pwned.push(item);

      if (isPasswordItem) {
        const pwScore = pw ? calculatePasswordScore(pw) : 0;
        if (pw.length < 8 || pwScore < PASSWORD_WEAK_SCORE_THRESHOLD) {
          weak.push(item);
          weakScores.set(item.id, pwScore);
        } else if (pwScore >= PASSWORD_SECURE_SCORE_THRESHOLD && !isReused && !isPwned) {
          secure.push(item);
        }
      }

      if (itemNeedsTwoFactor(item)) {
        missingTotp.push(item);
      }
      if (item.category === 'login' && getItemPasswordAgeInDays(item) >= PASSWORD_OLD_AGE_DAYS) {
        oldPw.push(item);
      }
      if (isUnsecureHttpUrl(item.url)) {
        httpOnly.push(item);
      }
    }

    return {
      weakItems: weak,
      weakScoreById: weakScores,
      reusedItems: reused,
      reusedGroups: reusedGroupList,
      pwnedItems: pwned,
      secureItems: secure,
      missingTotpItems: missingTotp,
      oldPasswordItems: oldPw,
      unsecureHttpItems: httpOnly,
    };
  }, [items, pwnedItemIds]);

  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);

  // Merge authentic stored history with current score without mutating storage during render
  const history = React.useMemo(() => {
    const stored = getAuditScoreHistory();
    const today = new Date().toISOString().split('T')[0] ?? '';
    if (stored.length === 0) {
      return [{ date: today, score: audit.score }];
    }
    const merged = stored.map((entry) =>
      entry.date === today ? { ...entry, score: audit.score } : entry,
    );
    if (!merged.some((entry) => entry.date === today) && today) {
      merged.push({ date: today, score: audit.score });
      if (merged.length > 10) merged.shift();
    }
    return merged;
  }, [audit.score]);

  // Map history values to SVG viewBox coordinates (400 width x 100 height)
  const points = React.useMemo(() => {
    return history.map((h, i) => {
      const x = history.length > 1 ? (i / (history.length - 1)) * 380 + 10 : 200;
      const y = 90 - (h.score / 100) * 80;
      return { x, y, score: h.score, date: h.date };
    });
  }, [history]);

  React.useEffect(() => {
    if (hoveredIndex !== null && tooltipRef.current) {
      const p = points[hoveredIndex];
      if (p) {
        tooltipRef.current.style.left = `${(p.x / 400) * 100}%`;
        tooltipRef.current.style.top = `${(p.y / 100) * 100}%`;
      }
    }
  }, [hoveredIndex, points]);

  const tooltipAlignClass =
    hoveredIndex === null || points.length <= 1
      ? '-translate-x-1/2'
      : hoveredIndex === 0
        ? 'translate-x-0'
        : hoveredIndex === points.length - 1
          ? '-translate-x-full'
          : '-translate-x-1/2';

  // Bezier curve path generator
  const bezierPath = React.useMemo(() => {
    if (points.length === 0) return '';
    if (points.length === 1) {
      const y = points[0]!.y;
      return `M 10 ${y} L 390 ${y}`;
    }
    let d = `M ${points[0]!.x} ${points[0]!.y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i]!;
      const p1 = points[i + 1]!;
      const cpX1 = p0.x + (p1.x - p0.x) / 3;
      const cpY1 = p0.y;
      const cpX2 = p0.x + (2 * (p1.x - p0.x)) / 3;
      const cpY2 = p1.y;
      d += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
    }
    return d;
  }, [points]);

  const bezierAreaPath = React.useMemo(() => {
    if (points.length === 0) return '';
    if (points.length === 1) {
      return `${bezierPath} L 390 95 L 10 95 Z`;
    }
    return `${bezierPath} L ${points[points.length - 1]!.x} 95 L ${points[0]!.x} 95 Z`;
  }, [points, bezierPath]);

  // Unified score thresholds matching DashboardSecurityScoreCard and VaultItemSecurityAssessment
  let scoreFeedback = {
    title: t('securityAudit.excellentTitle'),
    desc: t('securityAudit.excellentDescription'),
    colorBorder: 'border-l-brand-tertiary',
    textColor: 'text-brand-tertiary',
  };

  if (audit.score < AUDIT_CRITICAL_THRESHOLD) {
    scoreFeedback = {
      title: t('securityAudit.criticalTitle'),
      desc: t('securityAudit.criticalDescription'),
      colorBorder: 'border-l-brand-error',
      textColor: 'text-brand-error',
    };
  } else if (audit.score < AUDIT_EXCELLENT_THRESHOLD || pwnedItems.length > 0) {
    scoreFeedback = {
      title: t('securityAudit.improvementTitle'),
      desc: t('securityAudit.improvementDescription'),
      colorBorder: 'border-l-brand-secondary',
      textColor: 'text-brand-secondary',
    };
  }

  const toggleFilter = (filter: AuditFilterKey) => {
    setActiveFilter((prev) => (prev === filter ? 'all' : filter));
  };

  const showSection = (key: Exclude<AuditFilterKey, 'all'>) =>
    activeFilter === 'all' || activeFilter === key;

  const filterOptions: Array<{ key: AuditFilterKey; label: string; count?: number }> = [
    { key: 'all', label: t('securityAudit.filterAll') },
    ...(pwnedItems.length > 0
      ? [{ key: 'pwned' as const, label: t('securityAudit.filterPwned'), count: pwnedItems.length }]
      : []),
    { key: 'weak', label: t('securityAudit.filterWeak'), count: weakItems.length },
    { key: 'reused', label: t('securityAudit.filterReused'), count: reusedItems.length },
    { key: 'totp', label: t('securityAudit.filterTotp'), count: missingTotpItems.length },
    { key: 'old', label: t('securityAudit.filterOld'), count: oldPasswordItems.length },
    { key: 'http', label: t('securityAudit.filterHttp'), count: unsecureHttpItems.length },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto pb-6">
      <div className="flex items-center justify-between gap-3 mb-1 sm:mb-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brand-tertiary/10 flex items-center justify-center border border-brand-tertiary/20">
            <ShieldCheck className="w-5 h-5 text-brand-tertiary" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-display text-on-surface">{t('securityAudit.title')}</h2>
            <p className="hidden sm:block text-xs text-on-surface-variant">{t('securityAudit.subtitle')}</p>
          </div>
        </div>
        {items.length > 0 && (
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono text-on-surface-variant bg-surface-low border border-outline-variant/15 px-3 py-1 rounded-full">
            {t('securityAudit.audited')}: {items.length} {t('securityAudit.item')}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Score Visualizer */}
        <div className={`lg:col-span-2 glass-panel p-4 sm:p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-6 border-l-4 ${scoreFeedback.colorBorder}`}>
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full">
            {/* Circular SVG dial */}
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                <path
                  className="text-surface-high stroke-current"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  strokeWidth="3.2"
                />
                <path
                  className={`${scoreFeedback.textColor} stroke-current transition-all duration-700`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  strokeDasharray={`${audit.score}, 100`}
                  strokeLinecap="round"
                  strokeWidth="3.2"
                />
              </svg>
              <div
                data-testid="security-audit-score"
                className={`absolute inset-0 flex items-center justify-center font-mono font-bold text-lg sm:text-xl whitespace-nowrap tabular-nums ${scoreFeedback.textColor}`}
              >
                {formatPercent(audit.score, language)}
              </div>
            </div>
            <div className="text-center sm:text-left">
              <h4 className="font-bold text-lg font-display text-on-surface">{scoreFeedback.title}</h4>
              <p className="text-on-surface-variant text-xs sm:text-sm mt-1 max-w-lg leading-relaxed">{scoreFeedback.desc}</p>
            </div>
          </div>
        </div>

        {/* Security Score Trend line chart */}
        <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-outline-variant/15 flex flex-col justify-between relative group/chart overflow-visible">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand-tertiary" />
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{t('securityAudit.trendTitle')}</span>
            </div>
            <span className="text-[10px] text-on-surface-variant font-mono">{t('securityAudit.lastAudits', { count: history.length })}</span>
          </div>

          <div className="relative h-20 w-full mt-2">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 400 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand-tertiary)" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="var(--brand-tertiary)" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {/* Horizontal grid lines */}
              <line x1="10" y1="10" x2="390" y2="10" stroke="var(--outline-variant)" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.3" />
              <line x1="10" y1="50" x2="390" y2="50" stroke="var(--outline-variant)" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.3" />
              <line x1="10" y1="90" x2="390" y2="90" stroke="var(--outline-variant)" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.3" />

              {/* Vertical dotted grid lines for data points */}
              {points.map((p, idx) => (
                <line key={`vgrid-${idx}`} x1={p.x} y1="10" x2={p.x} y2="90" stroke="var(--outline-variant)" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.15" />
              ))}

              {/* Vertical hover alignment line */}
              {hoveredIndex !== null && (
                <line
                  x1={points[hoveredIndex]!.x}
                  y1="10"
                  x2={points[hoveredIndex]!.x}
                  y2="90"
                  stroke="var(--brand-tertiary)"
                  strokeWidth="1.2"
                  strokeDasharray="2,2"
                  opacity="0.5"
                />
              )}

              {/* Area fill */}
              {bezierAreaPath && <path d={bezierAreaPath} fill="url(#chartGradient)" />}

              {/* Bezier path line */}
              {bezierPath && (
                <path
                  fill="none"
                  stroke="var(--brand-tertiary)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={bezierPath}
                />
              )}

              {/* Interactive Dots */}
              {points.map((p, idx) => (
                <g key={idx}>
                  {hoveredIndex === idx && (
                    <circle cx={p.x} cy={p.y} r="7" fill="var(--brand-tertiary)" opacity="0.2" />
                  )}
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={hoveredIndex === idx ? '5.5' : '3.5'}
                    fill={hoveredIndex === idx ? 'var(--brand-tertiary)' : 'var(--surface-container)'}
                    stroke="var(--brand-tertiary)"
                    strokeWidth="2"
                    className="transition-all duration-150 cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="16"
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                </g>
              ))}
            </svg>

            {/* Clamped HTML Tooltip */}
            {hoveredIndex !== null && (
              <div
                ref={tooltipRef}
                className={`absolute pointer-events-none bg-surface-container/95 border border-brand-tertiary/25 backdrop-blur-md rounded-lg p-2 text-left shadow-xl z-20 ${tooltipAlignClass} -translate-y-[125%]`}
              >
                <div className="text-[10px] text-on-surface-variant font-mono font-bold whitespace-nowrap">
                  {points[hoveredIndex]!.date}
                </div>
                <div className="text-xs font-bold text-brand-tertiary flex items-center gap-1.5 mt-0.5 whitespace-nowrap">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-tertiary" />
                  {t('securityAudit.securityLabel')}: {formatPercent(points[hoveredIndex]!.score, language)}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between text-[9px] text-on-surface-variant/60 font-mono mt-1 pt-1 border-t border-outline-variant/10">
            <span>{history[0]?.date}</span>
            <span>{history[history.length - 1]?.date}</span>
          </div>
        </div>
      </div>

      {/* Metric quick stats dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => toggleFilter('weak')}
          aria-pressed={activeFilter === 'weak'}
          className={`text-left glass-panel p-4 sm:p-5 rounded-xl bg-brand-error/5 border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-error/40 ${
            activeFilter === 'weak'
              ? 'border-brand-error/50 ring-1 ring-brand-error/25'
              : 'border-brand-error/15 hover:border-brand-error/35'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-on-surface-variant uppercase">{t('securityAudit.weakPasswords')}</span>
            <AlertCircle className="w-5 h-5 text-brand-error" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span data-testid="security-audit-weak-count" className="text-3xl font-bold font-sans text-brand-error tabular-nums">{weakItems.length}</span>
            <span className="text-xs text-on-surface-variant">{t('securityAudit.insufficientCharacters')}</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => toggleFilter('reused')}
          aria-pressed={activeFilter === 'reused'}
          className={`text-left glass-panel p-4 sm:p-5 rounded-xl bg-brand-secondary/5 border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary/40 ${
            activeFilter === 'reused'
              ? 'border-brand-secondary/50 ring-1 ring-brand-secondary/25'
              : 'border-brand-secondary/15 hover:border-brand-secondary/35'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-on-surface-variant uppercase">{t('securityAudit.reusedPasswords')}</span>
            <AlertTriangle className="w-5 h-5 text-brand-secondary" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span data-testid="security-audit-reused-count" className="text-3xl font-bold font-sans text-brand-secondary tabular-nums">{reusedItems.length}</span>
            <span className="text-xs text-on-surface-variant">{t('securityAudit.reducesSecurity')}</span>
          </div>
        </button>

        <div className="glass-panel p-4 sm:p-5 rounded-xl bg-brand-tertiary/5 border border-brand-tertiary/15">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold tracking-wider text-on-surface-variant uppercase">{t('securityAudit.securePasswords')}</span>
            <Sparkles className="w-5 h-5 text-brand-tertiary" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span data-testid="security-audit-secure-count" className="text-3xl font-bold font-sans text-brand-tertiary tabular-nums">{secureItems.length}</span>
            <span className="text-xs text-on-surface-variant">{t('securityAudit.militaryProtection')}</span>
          </div>
        </div>

        <div
          className={`glass-panel p-4 sm:p-5 rounded-xl bg-brand-error/5 border flex flex-col justify-between transition-all ${
            activeFilter === 'pwned'
              ? 'border-brand-error/50 ring-1 ring-brand-error/25'
              : 'border-brand-error/15'
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold tracking-wider text-on-surface-variant uppercase">{t('securityAudit.pwnedPasswords')}</span>
              <div className="flex items-center gap-1.5">
                {localHibpPath ? (
                  <span
                    data-testid="security-audit-hibp-local-badge"
                    title={localHibpPath}
                    className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border bg-brand-tertiary/15 text-brand-tertiary border-brand-tertiary/30"
                  >
                    <HardDrive className="w-2.5 h-2.5" />
                    <span>{t('securityAudit.hibpLocalActive')}</span>
                    <button
                      type="button"
                      data-testid="security-audit-hibp-local-clear"
                      onClick={handleClearLocalHibp}
                      title={t('securityAudit.hibpLocalClear')}
                      aria-label={t('securityAudit.hibpLocalClear')}
                      className="ml-0.5 hover:opacity-75 cursor-pointer"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      data-testid="security-audit-hibp-toggle"
                      onClick={handleToggleHibp}
                      title={hibpEnabled ? t('securityAudit.hibpToggleEnabled') : t('securityAudit.hibpToggleDisabled')}
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                        hibpEnabled
                          ? 'bg-brand-primary/15 text-brand-primary border-brand-primary/30'
                          : 'bg-surface-low text-on-surface-variant border-outline-variant/25'
                      }`}
                    >
                      {hibpEnabled ? t('securityAudit.hibpStatusOn') : t('securityAudit.hibpStatusOffline')}
                    </button>
                    {localHibpSupported && (
                      <button
                        type="button"
                        data-testid="security-audit-hibp-local-select"
                        onClick={handleSelectLocalHibp}
                        title={t('securityAudit.hibpLocalSelect')}
                        aria-label={t('securityAudit.hibpLocalSelect')}
                        className="p-1 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-high transition-colors cursor-pointer"
                      >
                        <HardDrive className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                )}
                {isBreachCheckActive && (
                  <button
                    type="button"
                    data-testid="security-audit-hibp-rescan"
                    onClick={handleManualRescan}
                    disabled={effectiveHibpStatus === 'checking'}
                    title={t('passwordGenerator.refresh')}
                    aria-label={t('passwordGenerator.refresh')}
                    className="p-1 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-high disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${effectiveHibpStatus === 'checking' ? 'animate-spin' : ''}`} />
                  </button>
                )}
                {isBreachCheckActive && (
                  effectiveHibpStatus === 'unavailable' ? (
                    <WifiOff className="w-4 h-4 text-brand-secondary" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-brand-error" />
                  )
                )}
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span data-testid="security-audit-pwned-count" className="text-3xl font-bold font-sans text-brand-error tabular-nums">
                {isBreachCheckActive ? pwnedItems.length : '—'}
              </span>
              <span
                className="text-xs text-on-surface-variant"
                title={effectiveHibpStatus === 'checking' ? t('securityAudit.hibpUniqueTooltip') : undefined}
              >
                {localHibpError
                  ? localHibpError
                  : !isBreachCheckActive
                    ? t('securityAudit.pwnedDisabled')
                    : effectiveHibpStatus === 'checking'
                      ? (effectiveHibpProgress && effectiveHibpProgress.total > 0
                        ? `${t('securityAudit.pwnedChecking')} (${effectiveHibpProgress.done}/${effectiveHibpProgress.total} ${t('securityAudit.uniquePasswordsShort')})`
                        : t('securityAudit.pwnedChecking'))
                      : effectiveHibpStatus === 'unavailable'
                        ? t('securityAudit.pwnedUnavailable')
                        : t('securityAudit.pwnedDescription')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Category Filter Bar */}
      <div
        role="tablist"
        aria-label={t('securityAudit.title')}
        data-testid="security-audit-filter-bar"
        className="flex flex-wrap items-center gap-1.5 pt-1"
      >
        {filterOptions.map((opt) => {
          const isActive = activeFilter === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`security-audit-filter-${opt.key}`}
              onClick={() => setActiveFilter(opt.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 ${
                isActive
                  ? 'bg-brand-primary/15 text-brand-primary border-brand-primary/35 shadow-sm'
                  : 'bg-surface-low text-on-surface-variant border-outline-variant/15 hover:text-on-surface hover:bg-surface-high'
              }`}
            >
              <span>{opt.label}</span>
              {typeof opt.count === 'number' && opt.count > 0 && (
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-brand-primary/20 text-brand-primary' : 'bg-surface-high text-on-surface-variant'
                }`}>
                  {opt.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Action lists for correcting credentials */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 pt-1">
        {/* PWNED GROUPS (Shown at top when present because breached passwords are highest priority) */}
        {pwnedItems.length > 0 && showSection('pwned') && (
          <div className="space-y-3 lg:col-span-2">
            <h3 className="text-sm font-bold text-brand-error uppercase tracking-wider flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{t('securityAudit.pwnedGroup')} ({pwnedItems.length})</span>
            </h3>

            <div className="space-y-2.5">
              {pwnedItems.map((item) => {
                const count = effectivePwnedByItemId.get(item.id) || 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-testid="security-audit-pwned-item"
                    onClick={() => onSelectItem(item)}
                    className="w-full text-left flex items-center justify-between gap-3 p-3 sm:p-4 bg-brand-error/5 hover:bg-brand-error/10 border border-brand-error/25 rounded-xl cursor-pointer transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-error/40"
                  >
                    <div className="overflow-hidden pr-2 min-w-0">
                      <h4 className="font-semibold text-sm text-brand-error group-hover:underline truncate">
                        {item.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-on-surface-variant mt-0.5">
                        <span className="inline-flex items-center gap-1 min-w-0">
                          <User className="w-3.5 h-3.5 shrink-0 text-on-surface-variant/60" />
                          <span className="font-mono truncate">{item.username}</span>
                        </span>
                        <span className="text-[11px] font-mono font-semibold text-brand-error shrink-0">
                          {t('securityAudit.pwnedCountPrefix')} {count.toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-brand-error bg-brand-error/10 px-2.5 py-1 rounded-full shrink-0">
                      <span>{t('securityAudit.fixAction')}</span>
                      <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* WEAK CRITICAL GROUP */}
        {showSection('weak') && (
          <div className={`space-y-3 ${activeFilter === 'weak' ? 'lg:col-span-2' : ''}`}>
            <h3 className="text-sm font-bold text-brand-error uppercase tracking-wider flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              <span>{t('securityAudit.weakGroup')} ({weakItems.length})</span>
            </h3>

            <div className="space-y-2.5">
              {weakItems.length === 0 ? (
                <div className="p-4 bg-surface-low rounded-xl text-xs text-on-surface-variant/70 italic text-center border border-outline-variant/15">
                  {t('securityAudit.noWeakPasswords')}
                </div>
              ) : (
                weakItems.map((item) => {
                  const pwScore = weakScoreById.get(item.id) ?? 0;
                  const pwLen = (item.password || '').length;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid="security-audit-weak-item"
                      onClick={() => onSelectItem(item)}
                      className="w-full text-left flex items-center justify-between gap-3 p-3 sm:p-4 bg-brand-error/5 hover:bg-brand-error/10 border border-brand-error/20 rounded-xl cursor-pointer transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-error/40"
                    >
                      <div className="overflow-hidden pr-2 min-w-0">
                        <h4 className="font-semibold text-sm text-brand-error group-hover:underline truncate">
                          {item.title}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-on-surface-variant mt-0.5">
                          <span className="inline-flex items-center gap-1 min-w-0">
                            <User className="w-3.5 h-3.5 shrink-0 text-on-surface-variant/60" />
                            <span className="font-mono truncate">{item.username}</span>
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-brand-error/10 text-brand-error shrink-0">
                            {pwLen === 0 ? '0 ch' : `${pwLen} ch · ${pwScore}/100`}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-brand-error bg-brand-error/10 px-2.5 py-1 rounded-full shrink-0">
                        <span>{t('securityAudit.fixAction')}</span>
                        <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* REUSED GROUPS (Clustered by shared password) */}
        {showSection('reused') && (
          <div className={`space-y-3 ${activeFilter === 'reused' ? 'lg:col-span-2' : ''}`}>
            <h3 className="text-sm font-bold text-brand-secondary uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              <span>{t('securityAudit.reusedGroup')} ({reusedItems.length})</span>
            </h3>

            <div className="space-y-3">
              {reusedGroups.length === 0 ? (
                <div className="p-4 bg-surface-low rounded-xl text-xs text-on-surface-variant/70 italic text-center border border-outline-variant/15">
                  {t('securityAudit.noReusedPasswords')}
                </div>
              ) : (
                reusedGroups.map((group, groupIdx) => (
                  <div
                    key={group.map((g) => g.id).join('-')}
                    data-testid="security-audit-reused-cluster"
                    className="rounded-xl border border-brand-secondary/20 bg-brand-secondary/5 p-2.5 space-y-2"
                  >
                    <div className="flex items-center justify-between px-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-secondary">
                      <span className="inline-flex items-center gap-1.5">
                        <Copy className="w-3 h-3" />
                        <span>{t('securityAudit.reusedClusterLabel', { index: groupIdx + 1, count: group.length })}</span>
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {group.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          data-testid="security-audit-reused-item"
                          onClick={() => onSelectItem(item)}
                          className="w-full text-left flex items-center justify-between gap-3 p-2.5 sm:p-3 bg-surface-container/80 hover:bg-surface-high border border-outline-variant/15 rounded-lg cursor-pointer transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary/40"
                        >
                          <div className="overflow-hidden pr-2 min-w-0">
                            <h4 className="font-semibold text-sm text-on-surface group-hover:underline truncate">
                              {item.title}
                            </h4>
                            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5">
                              <User className="w-3.5 h-3.5 shrink-0 text-on-surface-variant/60" />
                              <span className="font-mono truncate">{item.username}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-brand-secondary bg-brand-secondary/10 px-2.5 py-1 rounded-full shrink-0">
                            <span>{t('securityAudit.changeAction')}</span>
                            <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TOTP DEFICIENCY */}
        {showSection('totp') && (
          <div className={`space-y-3 ${activeFilter === 'totp' ? 'lg:col-span-2' : ''}`}>
            <h3 className="text-sm font-bold text-brand-secondary uppercase tracking-wider flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              <span>{t('securityAudit.totpGroup')} ({missingTotpItems.length})</span>
            </h3>

            <div className="space-y-2.5">
              {missingTotpItems.length === 0 ? (
                <div className="p-4 bg-surface-low rounded-xl text-xs text-on-surface-variant/70 italic text-center border border-outline-variant/15">
                  {t('securityAudit.noTotpDeficiency')}
                </div>
              ) : (
                missingTotpItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid="security-audit-totp-item"
                    onClick={() => onSelectItem(item)}
                    className="w-full text-left flex items-center justify-between gap-3 p-3 sm:p-4 bg-brand-secondary/5 hover:bg-brand-secondary/10 border border-brand-secondary/20 rounded-xl cursor-pointer transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary/40"
                  >
                    <div className="overflow-hidden pr-2 min-w-0">
                      <h4 className="font-semibold text-sm text-on-surface group-hover:underline truncate">
                        {item.title}
                      </h4>
                      <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5 font-mono truncate">
                        {item.url}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-brand-secondary bg-brand-secondary/10 px-2.5 py-1 rounded-full shrink-0">
                      <span>{t('securityAudit.totpAction')}</span>
                      <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* OLD PASSWORDS */}
        {showSection('old') && (
          <div className={`space-y-3 ${activeFilter === 'old' ? 'lg:col-span-2' : ''}`}>
            <h3 className="text-sm font-bold text-brand-primary uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>{t('securityAudit.oldGroup')} ({oldPasswordItems.length})</span>
            </h3>

            <div className="space-y-2.5">
              {oldPasswordItems.length === 0 ? (
                <div className="p-4 bg-surface-low rounded-xl text-xs text-on-surface-variant/70 italic text-center border border-outline-variant/15">
                  {t('securityAudit.noOldPasswords')}
                </div>
              ) : (
                oldPasswordItems.map((item) => {
                  const age = getItemPasswordAgeInDays(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-testid="security-audit-old-item"
                      onClick={() => onSelectItem(item)}
                      className="w-full text-left flex items-center justify-between gap-3 p-3 sm:p-4 bg-brand-primary/5 hover:bg-brand-primary/10 border border-brand-primary/20 rounded-xl cursor-pointer transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
                    >
                      <div className="overflow-hidden pr-2 min-w-0">
                        <h4 className="font-semibold text-sm text-on-surface group-hover:underline truncate">
                          {item.title}
                        </h4>
                        <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5">
                          <Clock className="w-3.5 h-3.5 text-brand-primary shrink-0" />
                          <span>{t('securityAudit.passwordAge').replace('{age}', String(age))}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-full shrink-0">
                        <span>{t('securityAudit.updateAction')}</span>
                        <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* UNSECURE HTTP */}
        {showSection('http') && (
          <div className="space-y-3 lg:col-span-2">
            <h3 className="text-sm font-bold text-brand-error uppercase tracking-wider flex items-center gap-2">
              <Link className="w-4 h-4" />
              <span>{t('securityAudit.httpGroup')} ({unsecureHttpItems.length})</span>
            </h3>

            <div className="space-y-2.5">
              {unsecureHttpItems.length === 0 ? (
                <div className="p-4 bg-surface-low rounded-xl text-xs text-on-surface-variant/70 italic text-center border border-outline-variant/15">
                  {t('securityAudit.noHttpGroup')}
                </div>
              ) : (
                unsecureHttpItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-testid="security-audit-http-item"
                    onClick={() => onSelectItem(item)}
                    className="w-full text-left flex items-center justify-between gap-3 p-3 sm:p-4 bg-brand-error/5 hover:bg-brand-error/10 border border-brand-error/20 rounded-xl cursor-pointer transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-error/40"
                  >
                    <div className="overflow-hidden pr-2 min-w-0">
                      <h4 className="font-semibold text-sm text-brand-error group-hover:underline truncate">
                        {item.title}
                      </h4>
                      <div className="flex items-center gap-1.5 text-xs text-on-surface-variant mt-0.5 font-mono truncate">
                        {item.url}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-brand-error bg-brand-error/10 px-2.5 py-1 rounded-full shrink-0">
                      <span>{t('securityAudit.fixActionShort')}</span>
                      <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
