import { expect, test } from '@playwright/test';

import { JobsPage } from './pages/jobs.page';
import { ASSIGNEE_ID, CUSTOMER_ID, SIGNATURE_URL, scheduledSoon, uniqueTitle } from './test-data';

/**
 * The job lifecycle, end to end.
 *
 * Real browser, real Next.js server, real .NET API, real PostgreSQL. Nothing
 * mocked — an E2E test with a stubbed backend proves only that the stubs agree
 * with each other.
 */

test.describe('Jobs', () => {
  test('creates a job, filters it, and completes it', async ({ page }) => {
    const jobs = new JobsPage(page);
    const title = uniqueTitle('E2E roof inspection');

    await test.step('the jobs page loads', async () => {
      await jobs.goto();
      await expect(jobs.filterBar).toBeVisible();
    });

    await test.step('a new job is created through the modal', async () => {
      await jobs.createScheduledJob({
        title,
        description: 'Storm damage survey created by the end-to-end suite',
        customerId: CUSTOMER_ID,
        assigneeId: ASSIGNEE_ID,
        scheduledAt: scheduledSoon(),
      });
    });

    await test.step('it appears in the table as Scheduled', async () => {
      await expect(jobs.rowByTitle(title)).toBeVisible();
      await expect(jobs.statusOf(title)).toHaveText('Scheduled');
    });

    await test.step('filtering by status narrows the table', async () => {
      await jobs.filterByStatus('Scheduled');
      await expect(jobs.rowByTitle(title)).toBeVisible();

      // Filtering to a status the job is not in must hide it. This is the
      // assertion that proves the filter does something, which "still visible
      // after filtering to its own status" does not.
      await jobs.clearFilters();
      await jobs.filterByStatus('Cancelled');
      await expect(jobs.rowByTitle(title)).toBeHidden();

      await jobs.clearFilters();
      await expect(jobs.rowByTitle(title)).toBeVisible();
    });

    await test.step('the job is started', async () => {
      // Scheduled -> InProgress. The backend aggregate rejects a completion from
      // Scheduled, so this step is the lifecycle, not padding.
      await jobs.startJob(title);
    });

    await test.step('the job is completed', async () => {
      await jobs.completeJob(title, SIGNATURE_URL);
    });

    await test.step('its status becomes Completed and no actions remain', async () => {
      await expect(jobs.statusOf(title)).toHaveText('Completed');

      // The action buttons come from the state machine's `allowedActionsFor`,
      // which reports nothing for a terminal status. Asserting the absence
      // verifies the machine drives the UI rather than the UI guessing.
      await expect(jobs.actionsOf(title)).toContainText('No actions');
    });

    await test.step('the completed job survives a reload', async () => {
      // Everything above could pass on optimistic state alone. Reloading proves
      // the change was persisted by the API and not merely painted by the store.
      await page.reload();
      await expect(jobs.statusOf(title)).toHaveText('Completed');
    });
  });

  test('rejects a job scheduled in the past', async ({ page }) => {
    const jobs = new JobsPage(page);

    await jobs.goto();
    await jobs.openCreateModal();

    await page.getByTestId('create-job-title').fill(uniqueTitle('Past job'));
    await page.getByTestId('create-job-street').fill('12 Elm Street');
    await page.getByTestId('create-job-city').fill('Newark');
    await page.getByTestId('create-job-state').fill('NJ');
    await page.getByTestId('create-job-zip').fill('07102');
    await page.getByTestId('create-job-customer').selectOption(CUSTOMER_ID);
    await page.getByTestId('create-job-assignee').selectOption(ASSIGNEE_ID);

    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    await page.getByTestId('create-job-scheduled-date').fill(past);
    await page.getByTestId('create-job-scheduled-date').blur();

    // The client-side rule fires first, so submission is blocked before a
    // request is made. The backend aggregate enforces the same invariant
    // independently — the two are verified separately in the .NET unit tests.
    await expect(page.getByTestId('create-job-scheduled-date-error')).toBeVisible();
    await expect(page.getByTestId('create-job-submit')).toBeDisabled();
  });

  test('switching to draft mode hides the scheduling fields', async ({ page }) => {
    const jobs = new JobsPage(page);

    await jobs.goto();
    await jobs.openCreateModal();

    await expect(page.getByTestId('create-job-scheduled-date')).toBeVisible();

    await page.getByTestId('create-job-mode-draft').click();

    // The reducer clears the date and the assignee together with the mode. If it
    // did not, the backend would reject the draft for carrying half a schedule —
    // for a reason the user could not see, because the fields are gone.
    await expect(page.getByTestId('create-job-scheduled-date')).toBeHidden();
    await expect(page.getByTestId('create-job-assignee')).toBeHidden();

    await page.getByTestId('create-job-mode-scheduled').click();
    await expect(page.getByTestId('create-job-scheduled-date')).toHaveValue('');
  });

  test('an unknown job id renders the custom not-found page', async ({ page }) => {
    await page.goto('/jobs/00000000-0000-0000-0000-0000000000ff');

    await expect(page.getByTestId('job-not-found')).toBeVisible();
  });

  test('the filter bar is operable by keyboard', async ({ page }) => {
    const jobs = new JobsPage(page);
    await jobs.goto();

    const statusToggle = page.getByTestId('filter-status-Completed');

    await statusToggle.focus();
    await expect(statusToggle).toBeFocused();
    await expect(statusToggle).toHaveAttribute('aria-pressed', 'false');

    // Space activates a button in every browser. Verifying the toggle by keyboard
    // and by its ARIA state covers the two ways this control can be broken
    // without any visual change.
    await page.keyboard.press('Space');
    await expect(statusToggle).toHaveAttribute('aria-pressed', 'true');
  });
});
