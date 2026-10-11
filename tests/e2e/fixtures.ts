import { test as base, expect } from '@playwright/test';

/* Dismiss the first-run onboarding checklist before any application code runs.
 *
 * The checklist is a fixed panel that appears on a fresh profile, and it sits
 * over the vault workspace. Playwright refused clicks on it --
 *
 *   <div data-testid="onboarding-tour-panel" ...> intercepts pointer events
 *
 * -- which is correct behaviour for a click, and not a defect in the panel.
 * Twenty-five of the thirty-four scenarios failed on it, all in the same way,
 * which is why the suite has never been wired into CI: added as-is it would
 * turn every pull request red for a reason that has nothing to do with what the
 * tests are about.
 *
 * addInitScript rather than a beforeEach click: the flag is read during the
 * first render (useOnboardingTour.ts:35-37), so the value has to exist before
 * the app boots or the panel is already mounted by the time any dismissal
 * button could be clicked. It also removes a timing dependency from thirty-four
 * tests at once.
 *
 * No scenario here asserts anything about the checklist -- it is not what any of
 * them are testing -- so what is lost is coverage of an overlay they were never
 * covering anyway. A test for the checklist itself should opt back in by
 * clearing this flag, which is the point of putting it in a fixture rather than
 * in the helpers every spec already calls. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('KalderaShield_onboarding_dismissed', 'true');
    });
    await use(page);
  },
});

export { expect };