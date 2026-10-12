/**
 * @file useOnboardingTour.ts
 * @description Hook managing the 4-step onboarding checklist for new users.
 * Persists step completion and dismissal states in localStorage.
 *
 * @license Apache-2.0
 */

import { useState, useCallback, useMemo } from 'react';
import type { VaultItem } from '../types';

export const ONBOARDING_STORAGE_KEYS = {
  DISMISSED: 'KalderaShield_onboarding_dismissed',
  EXT_EXPLORED: 'KalderaShield_onboarding_ext_explored',
  EMERGENCY_KIT_DONE: 'KalderaShield_onboarding_emergency_kit_done',
  AUDIT_DONE: 'KalderaShield_onboarding_audit_done',
} as const;

export interface OnboardingStepState {
  id: 1 | 2 | 3 | 4;
  isComplete: boolean;
}

export interface UseOnboardingTourResult {
  isVisible: boolean;
  completedCount: number;
  totalSteps: number;
  steps: OnboardingStepState[];
  dismissTour: () => void;
  markStepComplete: (stepId: 1 | 2 | 3 | 4) => void;
  resetTour: () => void;
}

/* ── Why every catch in this file is here ────────────────────────────────────
 *
 * P3-3: this file used to carry seven `catch { // ignore }` blocks with no
 * reason, against a repo standard that every empty catch explains itself. They
 * were not accidental, they were just undocumented -- but four of them were the
 * same read four times over, so the honest form is one helper with one stated
 * consequence rather than eight silent blocks.
 *
 * The consequence, stated once: **localStorage can throw, and when it does this
 * tour forgets everything.** In Safari private mode `setItem` throws
 * QuotaExceededError; in an embedded WebView with DOM storage disabled,
 * `getItem` throws on access. Neither is exceptional for a password manager,
 * which is expected to run in whatever the user put it in.
 *
 * What that costs is that the checklist reappears on the next load. That is the
 * correct trade for a *checklist*: it is a hint, it holds no secret, and losing
 * it costs the user one glance at something they already did. The alternative --
 * letting a storage failure throw out of a React initialiser -- would take the
 * whole vault UI down with it, to protect a progress indicator.
 *
 * What it must never cost is the session. The React state is set outside the
 * try blocks, so a storage failure loses persistence, not the step the user just
 * completed. That separation is the whole reason the writes below are wrapped
 * and the setters are not, and it is worth stating because the reverse order
 * reads just as naturally.
 */

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    // DOM storage unavailable on access. The flag reads as "not yet", which is
    // the same state a first-time visitor is in.
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, 'true');
  } catch {
    // Quota or private mode. The step stays complete for this session and is
    // re-asked next time; see the note above.
  }
}

function clearFlags(keys: readonly string[]): void {
  for (const key of keys) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Same trade: `resetTour` has already reset the in-memory state, so the
      // tour is visible again either way. A storage that refuses removal will
      // refuse on the next read too.
    }
  }
}

const ALL_FLAG_KEYS: readonly string[] = [
  ONBOARDING_STORAGE_KEYS.DISMISSED,
  ONBOARDING_STORAGE_KEYS.EXT_EXPLORED,
  ONBOARDING_STORAGE_KEYS.EMERGENCY_KIT_DONE,
  ONBOARDING_STORAGE_KEYS.AUDIT_DONE,
];

export function useOnboardingTour(items: VaultItem[]): UseOnboardingTourResult {
  const [isDismissed, setIsDismissed] = useState<boolean>(() =>
    readFlag(ONBOARDING_STORAGE_KEYS.DISMISSED));

  const [extExplored, setExtExplored] = useState<boolean>(() =>
    readFlag(ONBOARDING_STORAGE_KEYS.EXT_EXPLORED));

  const [emergencyKitDone, setEmergencyKitDone] = useState<boolean>(() =>
    readFlag(ONBOARDING_STORAGE_KEYS.EMERGENCY_KIT_DONE));

  const [auditDone, setAuditDone] = useState<boolean>(() =>
    readFlag(ONBOARDING_STORAGE_KEYS.AUDIT_DONE));

  // Step 1 is complete if user has at least 1 non-deleted vault item
  const hasItems = useMemo(() => {
    return items.some((item) => !item.deleted);
  }, [items]);

  const steps: OnboardingStepState[] = useMemo(() => [
    { id: 1, isComplete: hasItems },
    { id: 2, isComplete: extExplored },
    { id: 3, isComplete: emergencyKitDone },
    { id: 4, isComplete: auditDone },
  ], [hasItems, extExplored, emergencyKitDone, auditDone]);

  const completedCount = useMemo(() => {
    return steps.filter((s) => s.isComplete).length;
  }, [steps]);

  const isVisible = useMemo(() => {
    if (isDismissed) return false;
    // If all 4 steps are complete, auto-hide
    if (completedCount === 4) return false;
    return true;
  }, [isDismissed, completedCount]);

  const dismissTour = useCallback(() => {
    setIsDismissed(true);
    writeFlag(ONBOARDING_STORAGE_KEYS.DISMISSED);
  }, []);

  const markStepComplete = useCallback((stepId: 1 | 2 | 3 | 4) => {
    // Step 1 has no case and needs none: it is derived from the item list, so
    // there is nothing to remember. The setters run before the write for every
    // other step, which is what keeps a storage failure from also losing the
    // step itself -- see the note above.
    if (stepId === 2) {
      setExtExplored(true);
      writeFlag(ONBOARDING_STORAGE_KEYS.EXT_EXPLORED);
    } else if (stepId === 3) {
      setEmergencyKitDone(true);
      writeFlag(ONBOARDING_STORAGE_KEYS.EMERGENCY_KIT_DONE);
    } else if (stepId === 4) {
      setAuditDone(true);
      writeFlag(ONBOARDING_STORAGE_KEYS.AUDIT_DONE);
    }
  }, []);

  const resetTour = useCallback(() => {
    setIsDismissed(false);
    setExtExplored(false);
    setEmergencyKitDone(false);
    setAuditDone(false);
    clearFlags(ALL_FLAG_KEYS);
  }, []);

  return {
    isVisible,
    completedCount,
    totalSteps: 4,
    steps,
    dismissTour,
    markStepComplete,
    resetTour,
  };
}
