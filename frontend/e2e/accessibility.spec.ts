import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { JobsPage } from './pages/jobs.page';

/**
 * Automated accessibility checks.
 *
 * ## What axe does and does not prove
 *
 * axe catches the machine-checkable failures — missing labels, insufficient
 * contrast, broken ARIA relationships, unlabelled controls — which is roughly a
 * third of WCAG. It cannot tell you whether the tab order makes sense or whether
 * an announcement is useful.
 *
 * So this file pairs the automated sweep with explicit keyboard and
 * screen-reader-semantics assertions that axe would pass regardless of how the
 * page actually behaves.
 */

test.describe('Accessibility', () => {
  test('the jobs list has no detectable WCAG 2.1 A/AA violations', async ({ page }) => {
    const jobs = new JobsPage(page);
    await jobs.goto();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    // Named so a failure reports what is wrong rather than "expected 0, got 3".
    expect(
      results.violations.map((violation) => `${violation.id}: ${violation.help}`),
    ).toEqual([]);
  });

  test('the create-job dialog has no detectable violations', async ({ page }) => {
    const jobs = new JobsPage(page);
    await jobs.goto();
    await jobs.openCreateModal();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(
      results.violations.map((violation) => `${violation.id}: ${violation.help}`),
    ).toEqual([]);
  });

  /**
   * The native `<dialog>` element's focus trap. A hand-rolled overlay has to
   * reimplement this, and usually reimplements it incompletely — which is the
   * argument for using the platform element.
   */
  test('the dialog traps focus and Escape closes it', async ({ page }) => {
    const jobs = new JobsPage(page);
    await jobs.goto();
    await jobs.openCreateModal();

    // Focus must be inside the dialog, not left on the button that opened it.
    const focusedInsideDialog = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="create-job-modal"]');
      return dialog?.contains(document.activeElement) ?? false;
    });
    expect(focusedInsideDialog).toBe(true);

    await page.keyboard.press('Escape');
    await expect(jobs.createModal).toBeHidden();
  });

  test('the skip link is the first thing a keyboard user reaches', async ({ page }) => {
    const jobs = new JobsPage(page);
    await jobs.goto();

    await page.keyboard.press('Tab');

    // Without it, a keyboard user tabs through the entire filter bar on every
    // page load before reaching the table.
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  });

  test('the sorted column is announced, not only styled', async ({ page }) => {
    const jobs = new JobsPage(page);
    await jobs.goto();

    const titleHeader = page.locator('th').filter({ hasText: 'Title' });

    // Sorted by scheduled date initially, so Title reports 'none'.
    await expect(titleHeader).toHaveAttribute('aria-sort', 'none');

    await page.getByTestId('jobs-sort-title').click();
    await expect(titleHeader).toHaveAttribute('aria-sort', 'ascending');

    await page.getByTestId('jobs-sort-title').click();
    await expect(titleHeader).toHaveAttribute('aria-sort', 'descending');
  });

  test('every row checkbox has an accessible name', async ({ page }) => {
    const jobs = new JobsPage(page);
    await jobs.goto();

    const checkboxes = page.locator('tbody input[type="checkbox"]');
    const count = await checkboxes.count();

    // A column of unlabelled checkboxes is announced as "checkbox, checkbox,
    // checkbox" — technically operable and practically unusable.
    for (let index = 0; index < count; index += 1) {
      await expect(checkboxes.nth(index)).toHaveAttribute('aria-label', /Select .+/);
    }
  });
});
