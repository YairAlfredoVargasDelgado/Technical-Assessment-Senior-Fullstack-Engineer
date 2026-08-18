'use client';

import { useCallback, useMemo } from 'react';

import type { JobFilters } from '@/domain/entities/job/job.entity';
import type { JobStatus } from '@/domain/entities/job';
import {
  selectFilters,
  selectHasActiveFilters,
  useJobsStore,
} from '@/presentation/stores/jobs.store';

/** Every status, in lifecycle order — the order a user expects to read them in. */
export const FILTERABLE_STATUSES: readonly JobStatus[] = [
  'Draft',
  'Scheduled',
  'InProgress',
  'Completed',
  'Cancelled',
];

export interface UseFilterJobsResult {
  readonly filters: JobFilters;
  readonly hasActiveFilters: boolean;
  readonly activeStatusCount: number;
  readonly setSearchTerm: (searchTerm: string) => void;
  readonly toggleStatus: (status: JobStatus) => void;
  readonly isStatusActive: (status: JobStatus) => boolean;
  readonly setDateRange: (from: string | null, to: string | null) => void;
  readonly reset: () => void;
}

/**
 * The filter bar's behaviour.
 *
 * ## Why filters live in the store and not in this hook
 *
 * They are read by two consumers that are not in the same subtree: the filter bar
 * writes them, and `useVisibleJobs` reads them to derive the rows. `useState` here
 * would mean lifting them to a common ancestor and threading them down through
 * every component in between — the prop drilling the store exists to remove.
 *
 * ## Why each selector is subscribed to individually
 *
 * `useJobsStore(selectFilters)` re-renders only when `filters` changes identity.
 * A single selector returning `{ filters, hasActive }` would build a new object on
 * every store change — including a selection toggle or an optimistic patch — and
 * re-render the filter bar for state it does not display.
 */
export function useFilterJobs(): UseFilterJobsResult {
  const filters = useJobsStore(selectFilters);
  const hasActiveFilters = useJobsStore(selectHasActiveFilters);

  const setSearchTerm = useJobsStore((state) => state.setSearchTerm);
  const toggleStatusFilter = useJobsStore((state) => state.toggleStatusFilter);
  const setDateRangeFilter = useJobsStore((state) => state.setDateRange);
  const resetFilters = useJobsStore((state) => state.resetFilters);

  const isStatusActive = useCallback(
    (status: JobStatus) => filters.statuses.includes(status),
    [filters.statuses],
  );

  const activeStatusCount = useMemo(() => filters.statuses.length, [filters.statuses]);

  return {
    filters,
    hasActiveFilters,
    activeStatusCount,
    setSearchTerm,
    toggleStatus: toggleStatusFilter,
    isStatusActive,
    setDateRange: setDateRangeFilter,
    reset: resetFilters,
  };
}
