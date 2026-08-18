import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Page Object for `/jobs`.
 *
 * ## Why the specs never touch a selector
 *
 * Every locator in the suite is defined here. A spec reads as a sequence of user
 * intentions — `createScheduledJob(...)`, `filterByStatus('Completed')` — and
 * knows nothing about the DOM. When the markup changes, this file changes and no
 * spec does.
 *
 * ## Why `data-testid` and not CSS or text
 *
 * A class selector breaks when the design changes. A text selector breaks when
 * the copy changes, and breaks silently under translation. `data-testid` is a
 * contract that exists solely for tests, so changing it is a deliberate act
 * rather than a side effect of a refactor.
 *
 * ## Waiting
 *
 * Nothing here sleeps. Playwright's locators retry until the expectation holds,
 * so `expect(locator).toBeVisible()` waits for the streamed table, the Server
 * Action round trip and the `router.refresh()` without a fixed delay that would
 * be either flaky or slow.
 */
export class JobsPage {
  public constructor(private readonly page: Page) {}

  /* ------------------------------------------------------------------ */
  /* Locators                                                           */
  /* ------------------------------------------------------------------ */

  public get table(): Locator {
    return this.page.getByTestId('jobs-table');
  }

  public get emptyState(): Locator {
    return this.page.getByTestId('jobs-empty-state');
  }

  public get filterBar(): Locator {
    return this.page.getByTestId('job-filter-bar');
  }

  public get totalCount(): Locator {
    return this.page.getByTestId('jobs-total');
  }

  public get createModal(): Locator {
    return this.page.getByTestId('create-job-modal');
  }

  public get completeModal(): Locator {
    return this.page.getByTestId('complete-job-modal');
  }

  public rowByTitle(title: string): Locator {
    return this.page.locator('tbody tr').filter({ hasText: title });
  }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                         */
  /* ------------------------------------------------------------------ */

  public async goto(): Promise<void> {
    await this.page.goto('/jobs');

    // The filter bar is part of the streamed shell, so it appears before the
    // table. Waiting on it confirms the page rendered without waiting on the
    // data — which is the streaming behaviour under test.
    await expect(this.filterBar).toBeVisible();
  }

  /* ------------------------------------------------------------------ */
  /* Create                                                             */
  /* ------------------------------------------------------------------ */

  public async openCreateModal(): Promise<void> {
    await this.page.getByTestId('open-create-job').click();
    await expect(this.createModal).toBeVisible();
  }

  /**
   * Fills and submits the create form for a scheduled job.
   *
   * Returns once the row is present, so a caller never has to wait afterwards.
   */
  public async createScheduledJob(input: {
    readonly title: string;
    readonly description?: string;
    readonly customerId: string;
    readonly assigneeId: string;
    readonly scheduledAt: string;
  }): Promise<void> {
    await this.openCreateModal();

    await this.page.getByTestId('create-job-mode-scheduled').click();

    await this.page.getByTestId('create-job-title').fill(input.title);

    if (input.description !== undefined) {
      await this.page.getByTestId('create-job-description').fill(input.description);
    }

    await this.page.getByTestId('create-job-street').fill('12 Elm Street');
    await this.page.getByTestId('create-job-city').fill('Newark');
    await this.page.getByTestId('create-job-state').fill('NJ');
    await this.page.getByTestId('create-job-zip').fill('07102');
    // A dropdown, not a text field: the value is an identifier the API understands
    // and the label is a name the user recognises, so the suite selects by value.
    await this.page.getByTestId('create-job-customer').selectOption(input.customerId);
    await this.page.getByTestId('create-job-scheduled-date').fill(input.scheduledAt);
    await this.page.getByTestId('create-job-assignee').selectOption(input.assigneeId);

    const submit = this.page.getByTestId('create-job-submit');
    await expect(submit).toBeEnabled();
    await submit.click();

    // The modal closes only after the Server Action resolves and the route
    // refreshes, so its disappearance is the signal that the write completed.
    await expect(this.createModal).toBeHidden();
    await expect(this.rowByTitle(input.title)).toBeVisible();
  }

  public async submitButtonIsDisabled(): Promise<boolean> {
    return this.page.getByTestId('create-job-submit').isDisabled();
  }

  public async fieldError(field: string): Promise<Locator> {
    return this.page.getByTestId(`create-job-${field}-error`);
  }

  public async closeCreateModal(): Promise<void> {
    await this.page.getByTestId('create-job-cancel').click();
    await expect(this.createModal).toBeHidden();
  }

  /* ------------------------------------------------------------------ */
  /* Filter                                                             */
  /* ------------------------------------------------------------------ */

  public async filterByStatus(status: string): Promise<void> {
    const toggle = this.page.getByTestId(`filter-status-${status}`);
    await toggle.click();

    // Asserting on `aria-pressed` rather than a CSS class checks the thing that
    // actually matters to a screen-reader user, and is stable across restyles.
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  }

  public async search(term: string): Promise<void> {
    await this.page.getByTestId('filter-search').fill(term);
  }

  public async clearFilters(): Promise<void> {
    await this.page.getByTestId('filter-reset').click();
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                          */
  /* ------------------------------------------------------------------ */

  public async startJob(title: string): Promise<void> {
    await this.rowByTitle(title).getByRole('button', { name: 'Start' }).click();
    await expect(this.statusOf(title)).toHaveText('In progress');
  }

  public async completeJob(title: string, signatureUrl: string): Promise<void> {
    await this.rowByTitle(title).getByRole('button', { name: 'Complete' }).click();
    await expect(this.completeModal).toBeVisible();

    await this.page.getByTestId('complete-job-signature').fill(signatureUrl);

    const submit = this.page.getByTestId('complete-job-submit');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(this.completeModal).toBeHidden();
  }

  public statusOf(title: string): Locator {
    return this.rowByTitle(title).locator('.badge');
  }

  public actionsOf(title: string): Locator {
    return this.rowByTitle(title).locator('td').last();
  }
}
