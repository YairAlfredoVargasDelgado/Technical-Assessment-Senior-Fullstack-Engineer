'use client';

import { useMemo } from 'react';

import type { Job } from '@/domain/entities/job/job.entity';

import {
  applyJobFilters,
  applyJobSort,
  mergeOptimisticPatches,
  selectFilters,
  selectOptimisticPatches,
  selectSortConfig,
  useJobsStore,
} from './jobs.store';

/**
 * The rows the table should render: server data, overlaid, filtered and sorted.
 *
 * ## Why this is a `useMemo` and not a `useEffect`
 *
 * The obvious-looking alternative is:
 *
 * ```ts
 * const [filteredJobs, setFilteredJobs] = useState([]);
 * useEffect(() => { setFilteredJobs(filter(jobs, filters)); }, [jobs, filters]);
 * ```
 *
 * That is wrong in three separate ways, and all three are visible to users:
 *
 * 1. **It renders twice per change.** The effect runs *after* paint, so the user
 *    sees the previous list, then the new one.
 * 2. **The first paint is empty.** `filteredJobs` starts as `[]`, so the table
 *    flashes "no jobs found" before the effect has run.
 * 3. **It creates a second source of truth** that can disagree with its inputs
 *    whenever the dependency array is wrong — and a wrong dependency array is
 *    silent.
 *
 * `filteredJobs` is not state. It is a function of state, and computing it during
 * render is both correct and cheaper.
 *
 * ## Why the pipeline is three separate memos
 *
 * Typing in the search box changes `filters` but not `patches`, so the merge step
 * does not re-run. Sorting changes neither, so the filter step does not re-run.
 * One combined memo would recompute everything on every keystroke.
 */
export function useVisibleJobs(serverJobs: readonly Job[]): readonly Job[] {
  const patches = useJobsStore(selectOptimisticPatches);
  const filters = useJobsStore(selectFilters);
  const sortConfig = useJobsStore(selectSortConfig);

  const merged = useMemo(
    () => mergeOptimisticPatches(serverJobs, patches),
    [serverJobs, patches],
  );

  const filtered = useMemo(() => applyJobFilters(merged, filters), [merged, filters]);

  return useMemo(() => applyJobSort(filtered, sortConfig), [filtered, sortConfig]);
}

/**
 * Whether a given job has a change in flight.
 *
 * Lets a row render as pending without the table needing to know anything about
 * how optimistic updates are stored.
 */
export function useIsJobPending(jobId: string): boolean {
  return useJobsStore((state) => state.optimisticPatches[jobId] !== undefined);
}

/**
 * Aggregates over the visible rows.
 *
 * Derived from the *visible* list rather than the server list on purpose: the
 * counts a user reads next to a filtered table must describe what they can see,
 * not what exists.
 */
export interface JobTotals {
  readonly total: number;
  readonly completed: number;
  readonly inProgress: number;
  readonly scheduled: number;
  readonly pendingCount: number;
}

export function useJobTotals(visibleJobs: readonly Job[]): JobTotals {
  const patches = useJobsStore(selectOptimisticPatches);

  return useMemo(
    () => ({
      total: visibleJobs.length,
      completed: visibleJobs.filter((job) => job.status === 'Completed').length,
      inProgress: visibleJobs.filter((job) => job.status === 'InProgress').length,
      scheduled: visibleJobs.filter((job) => job.status === 'Scheduled').length,
      pendingCount: visibleJobs.filter((job) => patches[job.id] !== undefined).length,
    }),
    [visibleJobs, patches],
  );
}
