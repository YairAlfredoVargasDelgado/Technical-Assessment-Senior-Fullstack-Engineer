'use client';

import { Button } from '@/presentation/components/atoms/button.component';
import {
  ErrorBoundary,
  TableErrorFallback,
} from '@/presentation/components/organisms/error-boundary.component';
import type { Job } from '@/domain/entities/job/job.entity';
import type { Directory } from '@/application/ports/directory.port';

import { CreateJobModal } from '../../features/create-job';
import { FilterBar } from '../../features/filter-jobs';
import { CompleteJobModal } from '../../features/complete-job';
import { useJobsPage } from '../../hooks/use-jobs-page.hook';

import { JobsTable } from './jobs-table.component';

interface JobsClientProps {
  /**
   * The server's rows.
   *
   * Props, not store state. The list is owned by the Server Component that
   * fetched it; the store holds only the client-side overlay. See
   * `jobs.store.ts` for why.
   */
  readonly initialJobs: readonly Job[];
  readonly initialCursor: string | null;
  readonly initialHasNextPage: boolean;

  /** Picker options for the create dialog, resolved on the server. */
  readonly directory: Directory;
}

/**
 * The client boundary for the jobs view.
 *
 * ## Where `'use client'` sits, and why here
 *
 * This is the topmost client component in the route. Above it —
 * `layout.tsx`, `page.tsx`, `JobsLoader`, `StatusBadge` — everything renders on
 * the server and ships no JavaScript. Below it, interactivity.
 *
 * Putting `'use client'` on `page.tsx` instead would have been one line shorter
 * and would have pulled the entire route into the browser bundle, taken the data
 * fetch with it, and made the Suspense streaming above impossible. The boundary's
 * position is the architecture.
 *
 * ## A shell, again
 *
 * One hook call and some JSX. Every handler, every piece of state and every
 * derivation lives in `useJobsPage` and the slices it composes.
 */
export function JobsClient({ initialJobs, initialHasNextPage, directory }: JobsClientProps) {
  const page = useJobsPage(initialJobs);

  return (
    <>
      <div className="toolbar" style={{ justifyContent: 'flex-end', marginBottom: 16 }}>
        <Button variant="primary" onClick={page.openCreateModal} data-testid="open-create-job">
          New job
        </Button>
      </div>

      <FilterBar filters={page.filters}>
        <FilterBar.Search />
        <FilterBar.Status />
        <FilterBar.DateRange />
        <FilterBar.Reset />
      </FilterBar>

      {/*
        A second, finer boundary inside the route's own error.tsx. That one
        replaces the whole page; this one contains a failure to the table, so a
        single malformed row does not take the filter bar and the toolbar with it.
      */}
      <ErrorBoundary fallback={TableErrorFallback}>
        <JobsTable page={page} />
      </ErrorBoundary>

      {initialHasNextPage ? (
        <p className="field__hint" style={{ marginTop: 12 }} data-testid="jobs-has-more">
          More jobs are available. Narrow the filters to find a specific job.
        </p>
      ) : null}

      <CreateJobModal
        open={page.isCreateModalOpen}
        onClose={page.closeCreateModal}
        form={page.creation}
        directory={directory}
      />

      <CompleteJobModal completion={page.completion} />
    </>
  );
}
