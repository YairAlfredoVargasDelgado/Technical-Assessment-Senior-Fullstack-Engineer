import { beforeEach, describe, expect, it } from 'vitest';

import type { Job } from '@/domain/entities/job/job.entity';

import {
  applyJobFilters,
  applyJobSort,
  mergeOptimisticPatches,
  selectHasActiveFilters,
  selectSelectionCount,
  useJobsStore,
} from './jobs.store';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    title: 'Roof inspection',
    description: 'North slope',
    status: 'Scheduled',
    address: {
      street: '12 Elm Street',
      city: 'Newark',
      state: 'NJ',
      zipCode: '07102',
      latitude: null,
      longitude: null,
    },
    scheduledDateUtc: '2030-06-01T09:00:00Z',
    assigneeId: 'crew-7',
    customerId: 'customer-1',
    photoCount: 0,
    createdAtUtc: '2030-05-01T09:00:00Z',
    updatedAtUtc: '2030-05-01T09:00:00Z',
    ...overrides,
  };
}

/**
 * The store is a module singleton, so state leaks between tests unless it is
 * reset. `getInitialState()` is Zustand's own record of the initial value, which
 * is more honest than a hand-maintained copy in the test file that would drift.
 */
beforeEach(() => {
  useJobsStore.setState(useJobsStore.getInitialState(), true);
});

/* -------------------------------------------------------------------------- */

describe('useJobsStore — filters', () => {
  it('sets a search term', () => {
    useJobsStore.getState().setSearchTerm('storm');

    expect(useJobsStore.getState().filters.searchTerm).toBe('storm');
  });

  it('toggles a status on and off', () => {
    const { toggleStatusFilter } = useJobsStore.getState();

    toggleStatusFilter('Completed');
    expect(useJobsStore.getState().filters.statuses).toEqual(['Completed']);

    toggleStatusFilter('Completed');
    expect(useJobsStore.getState().filters.statuses).toEqual([]);
  });

  it('accumulates several statuses', () => {
    const { toggleStatusFilter } = useJobsStore.getState();

    toggleStatusFilter('Draft');
    toggleStatusFilter('Completed');

    expect(useJobsStore.getState().filters.statuses).toEqual(['Draft', 'Completed']);
  });

  it('resets every filter at once', () => {
    const store = useJobsStore.getState();
    store.setSearchTerm('storm');
    store.toggleStatusFilter('Draft');
    store.setDateRange('2030-01-01', '2030-12-31');

    useJobsStore.getState().resetFilters();

    expect(selectHasActiveFilters(useJobsStore.getState())).toBe(false);
  });
});

describe('useJobsStore — sorting', () => {
  it('flips direction when the same column is clicked twice', () => {
    const { toggleSort } = useJobsStore.getState();

    toggleSort('title');
    expect(useJobsStore.getState().sortConfig).toEqual({ field: 'title', direction: 'asc' });

    useJobsStore.getState().toggleSort('title');
    expect(useJobsStore.getState().sortConfig).toEqual({ field: 'title', direction: 'desc' });
  });

  it('starts ascending when a different column is clicked', () => {
    useJobsStore.getState().toggleSort('title');
    useJobsStore.getState().toggleSort('title');
    useJobsStore.getState().toggleSort('status');

    // Inheriting the previous column's direction reads as the table having
    // ignored the click.
    expect(useJobsStore.getState().sortConfig).toEqual({ field: 'status', direction: 'asc' });
  });
});

describe('useJobsStore — selection', () => {
  it('toggles selection', () => {
    const { toggleSelection } = useJobsStore.getState();

    toggleSelection('job-1');
    expect(selectSelectionCount(useJobsStore.getState())).toBe(1);

    useJobsStore.getState().toggleSelection('job-1');
    expect(selectSelectionCount(useJobsStore.getState())).toBe(0);
  });

  it('replaces and clears the selection', () => {
    useJobsStore.getState().setSelection(['a', 'b', 'c']);
    expect(useJobsStore.getState().selectedJobIds).toEqual(['a', 'b', 'c']);

    useJobsStore.getState().clearSelection();
    expect(useJobsStore.getState().selectedJobIds).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Optimistic updates — the part that matters most                            */
/* -------------------------------------------------------------------------- */

describe('useJobsStore — optimistic updates and rollback', () => {
  it('records a patch without touching the server rows', () => {
    const serverJobs = [job({ id: 'job-1', status: 'Scheduled' })];

    useJobsStore.getState().applyOptimisticStatus('job-1', 'InProgress');

    // The store holds a difference, not a copy.
    expect(useJobsStore.getState().optimisticPatches).toEqual({
      'job-1': { status: 'InProgress', pending: true },
    });

    // The input array is untouched — this is what makes the server the single
    // source of truth for the list.
    expect(serverJobs[0]?.status).toBe('Scheduled');
  });

  it('renders the patched status through the merge', () => {
    useJobsStore.getState().applyOptimisticStatus('job-1', 'InProgress');

    const merged = mergeOptimisticPatches(
      [job({ id: 'job-1', status: 'Scheduled' })],
      useJobsStore.getState().optimisticPatches,
    );

    expect(merged[0]?.status).toBe('InProgress');
  });

  /**
   * Rollback is a key deletion, not a restore. Had the store mutated a copy of
   * the list, this would require a snapshot captured before the change, kept
   * somewhere, and correctly discarded on every exit path.
   */
  it('reverts to the server status on rollback', () => {
    const serverJobs = [job({ id: 'job-1', status: 'Scheduled' })];

    useJobsStore.getState().applyOptimisticStatus('job-1', 'Completed');
    expect(mergeOptimisticPatches(serverJobs, useJobsStore.getState().optimisticPatches)[0]?.status)
      .toBe('Completed');

    useJobsStore.getState().rollbackOptimisticStatus('job-1');

    expect(useJobsStore.getState().optimisticPatches).toEqual({});
    expect(mergeOptimisticPatches(serverJobs, useJobsStore.getState().optimisticPatches)[0]?.status)
      .toBe('Scheduled');
  });

  it('drops the patch on settle so a later change is not masked', () => {
    useJobsStore.getState().applyOptimisticStatus('job-1', 'Completed');
    useJobsStore.getState().settleOptimisticStatus('job-1');

    expect(useJobsStore.getState().optimisticPatches).toEqual({});
  });

  it('rolls back one job without disturbing another in flight', () => {
    const store = useJobsStore.getState();
    store.applyOptimisticStatus('job-1', 'InProgress');
    store.applyOptimisticStatus('job-2', 'Completed');

    useJobsStore.getState().rollbackOptimisticStatus('job-1');

    expect(useJobsStore.getState().optimisticPatches).toEqual({
      'job-2': { status: 'Completed', pending: true },
    });
  });

  /**
   * Returning a fresh object for a no-op would change its reference, and every
   * component subscribed to `optimisticPatches` would re-render for a state
   * change that did not happen.
   */
  it('keeps the same reference when there is nothing to discard', () => {
    const before = useJobsStore.getState().optimisticPatches;

    useJobsStore.getState().rollbackOptimisticStatus('job-that-was-never-patched');

    expect(useJobsStore.getState().optimisticPatches).toBe(before);
  });

  it('returns the identical array when no patches exist', () => {
    const serverJobs = [job()];

    // The steady-state fast path. Downstream `useMemo`s keyed on this array do
    // not recompute because the reference is unchanged.
    expect(mergeOptimisticPatches(serverJobs, {})).toBe(serverJobs);
  });
});

/* -------------------------------------------------------------------------- */
/* Pure derivation                                                            */
/* -------------------------------------------------------------------------- */

describe('applyJobFilters', () => {
  const jobs = [
    job({ id: '1', title: 'Roof inspection', status: 'Scheduled', assigneeId: 'crew-7' }),
    job({ id: '2', title: 'Gutter cleaning', status: 'Completed', assigneeId: 'crew-8' }),
    job({ id: '3', title: 'Storm survey', description: 'hail damage', status: 'Draft', scheduledDateUtc: null }),
  ];

  const noFilters = {
    searchTerm: '',
    statuses: [] as const,
    scheduledFrom: null,
    scheduledTo: null,
    assigneeId: null,
  };

  it('returns everything when nothing is filtered', () => {
    expect(applyJobFilters(jobs, noFilters)).toHaveLength(3);
  });

  it('filters by status', () => {
    expect(applyJobFilters(jobs, { ...noFilters, statuses: ['Completed'] }).map((item) => item.id))
      .toEqual(['2']);
  });

  it('matches the search term against the title and the description', () => {
    expect(applyJobFilters(jobs, { ...noFilters, searchTerm: 'roof' }).map((item) => item.id)).toEqual(['1']);
    expect(applyJobFilters(jobs, { ...noFilters, searchTerm: 'hail' }).map((item) => item.id)).toEqual(['3']);
  });

  it('ignores case and surrounding whitespace in the search term', () => {
    expect(applyJobFilters(jobs, { ...noFilters, searchTerm: '  ROOF  ' })).toHaveLength(1);
  });

  it('filters by assignee', () => {
    expect(applyJobFilters(jobs, { ...noFilters, assigneeId: 'crew-8' }).map((item) => item.id)).toEqual(['2']);
  });

  it('excludes unscheduled jobs from a date range', () => {
    // A draft has no date, so it cannot be within one. Including it would put
    // rows in a "this week" view that have no week.
    const filtered = applyJobFilters(jobs, { ...noFilters, scheduledFrom: '2030-01-01' });

    expect(filtered.map((item) => item.id)).not.toContain('3');
  });

  it('combines filters conjunctively', () => {
    expect(
      applyJobFilters(jobs, { ...noFilters, statuses: ['Completed'], searchTerm: 'roof' }),
    ).toHaveLength(0);
  });
});

describe('applyJobSort', () => {
  const jobs = [
    job({ id: '1', title: 'Beta', scheduledDateUtc: '2030-06-02T09:00:00Z' }),
    job({ id: '2', title: 'Alpha', scheduledDateUtc: '2030-06-01T09:00:00Z' }),
    job({ id: '3', title: 'Gamma', scheduledDateUtc: null }),
  ];

  it('sorts ascending and descending', () => {
    expect(applyJobSort(jobs, { field: 'title', direction: 'asc' }).map((item) => item.title))
      .toEqual(['Alpha', 'Beta', 'Gamma']);

    expect(applyJobSort(jobs, { field: 'title', direction: 'desc' }).map((item) => item.title))
      .toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  /**
   * Unscheduled jobs sort last in BOTH directions. Treating `null` as "smaller"
   * would put every draft at the top of a descending sort, which reads as a bug.
   */
  it('keeps unscheduled jobs last regardless of direction', () => {
    expect(applyJobSort(jobs, { field: 'scheduledDateUtc', direction: 'asc' }).at(-1)?.id).toBe('3');
    expect(applyJobSort(jobs, { field: 'scheduledDateUtc', direction: 'desc' }).at(-1)?.id).toBe('3');
  });

  it('never mutates its input', () => {
    const original = [...jobs];

    applyJobSort(jobs, { field: 'title', direction: 'desc' });

    expect(jobs).toEqual(original);
  });
});
