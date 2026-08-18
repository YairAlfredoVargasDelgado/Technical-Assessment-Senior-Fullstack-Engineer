import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Job } from '@/domain/entities/job/job.entity';
import { useJobsStore } from '@/presentation/stores/jobs.store';

vi.mock('@app/jobs/actions', () => ({
  createJobAction: vi.fn(),
  startJobAction: vi.fn(),
  completeJobAction: vi.fn(),
  cancelJobAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { useJobsPage } = await import('./use-jobs-page.hook');
const { useFilterJobs } = await import('../features/filter-jobs');
const { useVisibleJobs, useJobTotals } = await import('@/presentation/stores/use-visible-jobs.hook');

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    title: 'Roof inspection',
    description: null,
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

const SERVER_JOBS: readonly Job[] = [
  job({ id: '1', title: 'Roof inspection', status: 'Scheduled' }),
  job({ id: '2', title: 'Gutter cleaning', status: 'InProgress' }),
  job({ id: '3', title: 'Storm survey', status: 'Completed' }),
  job({ id: '4', title: 'Draft job', status: 'Draft', scheduledDateUtc: null, assigneeId: null }),
];

beforeEach(() => {
  useJobsStore.setState(useJobsStore.getInitialState(), true);
});

describe('useVisibleJobs', () => {
  it('returns the server rows untouched when nothing is filtered', () => {
    const { result } = renderHook(() => useVisibleJobs(SERVER_JOBS));

    expect(result.current).toHaveLength(4);
  });

  /**
   * The core claim of the whole store design: derived state is computed during
   * render, so it is correct on the *first* paint. A `useEffect` would leave this
   * empty until after the commit, which is the flash of "no jobs found" users see
   * in applications that derive with effects.
   */
  it('reflects a filter change on the first render after it', () => {
    const { result, rerender } = renderHook(() => useVisibleJobs(SERVER_JOBS));

    act(() => {
      useJobsStore.getState().toggleStatusFilter('Completed');
    });
    rerender();

    expect(result.current.map((item) => item.id)).toEqual(['3']);
  });

  it('applies an optimistic patch over the server data', () => {
    const { result, rerender } = renderHook(() => useVisibleJobs(SERVER_JOBS));

    act(() => {
      useJobsStore.getState().applyOptimisticStatus('1', 'InProgress');
    });
    rerender();

    expect(result.current.find((item) => item.id === '1')?.status).toBe('InProgress');
    // The server array is never mutated.
    expect(SERVER_JOBS[0]?.status).toBe('Scheduled');
  });

  it('lets a patched job match a filter it did not previously match', () => {
    const { result, rerender } = renderHook(() => useVisibleJobs(SERVER_JOBS));

    act(() => {
      useJobsStore.getState().toggleStatusFilter('Completed');
      useJobsStore.getState().applyOptimisticStatus('1', 'Completed');
    });
    rerender();

    // The overlay is applied before filtering, so an optimistically completed job
    // appears immediately in a "Completed" view — which is what the user expects
    // after clicking Complete.
    expect(result.current.map((item) => item.id).sort()).toEqual(['1', '3']);
  });

  it('returns the same reference when nothing changed', () => {
    const { result, rerender } = renderHook(() => useVisibleJobs(SERVER_JOBS));
    const first = result.current;

    rerender();

    // Memoised end to end. A new array each render would defeat every downstream
    // `useMemo` and re-render the table on every parent render.
    expect(result.current).toBe(first);
  });
});

describe('useJobTotals', () => {
  it('counts by status over the visible rows', () => {
    const { result } = renderHook(() => useJobTotals(SERVER_JOBS));

    expect(result.current).toMatchObject({
      total: 4,
      scheduled: 1,
      inProgress: 1,
      completed: 1,
      pendingCount: 0,
    });
  });

  it('counts jobs with a change in flight', () => {
    const { result, rerender } = renderHook(() => useJobTotals(SERVER_JOBS));

    act(() => {
      useJobsStore.getState().applyOptimisticStatus('1', 'InProgress');
    });
    rerender();

    expect(result.current.pendingCount).toBe(1);
  });
});

describe('useFilterJobs', () => {
  it('reports active filters and clears them', () => {
    const { result, rerender } = renderHook(() => useFilterJobs());

    expect(result.current.hasActiveFilters).toBe(false);

    act(() => {
      result.current.toggleStatus('Draft');
    });
    rerender();

    expect(result.current.hasActiveFilters).toBe(true);
    expect(result.current.activeStatusCount).toBe(1);
    expect(result.current.isStatusActive('Draft')).toBe(true);

    act(() => {
      result.current.reset();
    });
    rerender();

    expect(result.current.hasActiveFilters).toBe(false);
  });

  it('writes the search term through to the store', () => {
    const { result } = renderHook(() => useFilterJobs());

    act(() => {
      result.current.setSearchTerm('storm');
    });

    expect(useJobsStore.getState().filters.searchTerm).toBe('storm');
  });
});

describe('useJobsPage', () => {
  it('composes the slices and exposes the visible rows', () => {
    const { result } = renderHook(() => useJobsPage(SERVER_JOBS));

    expect(result.current.jobs).toHaveLength(4);
    expect(result.current.totals.total).toBe(4);
    expect(result.current.filters.hasActiveFilters).toBe(false);
    expect(result.current.creation.isValid).toBe(false);
    expect(result.current.completion.target).toBeNull();
  });

  /**
   * The state machine from Part 1 driving the UI. These expectations come from
   * `JOB_TRANSITIONS` — the same table that types `transitionJob` — so the
   * buttons a row shows cannot disagree with what the machine accepts.
   */
  it('derives the available actions from the state machine', () => {
    const { result } = renderHook(() => useJobsPage(SERVER_JOBS));
    const { availableActions } = result.current;

    expect([...availableActions(job({ status: 'Draft' }))].sort()).toEqual(['schedule']);
    expect([...availableActions(job({ status: 'Scheduled' }))].sort()).toEqual(['cancel', 'start']);
    expect([...availableActions(job({ status: 'InProgress' }))].sort()).toEqual(['cancel', 'complete']);

    // Terminal: the table renders no action buttons, without knowing why.
    expect(availableActions(job({ status: 'Completed' }))).toEqual([]);
    expect(availableActions(job({ status: 'Cancelled' }))).toEqual([]);
  });

  it('manages the create modal', () => {
    const { result } = renderHook(() => useJobsPage(SERVER_JOBS));

    expect(result.current.isCreateModalOpen).toBe(false);

    act(() => {
      result.current.openCreateModal();
    });
    expect(result.current.isCreateModalOpen).toBe(true);

    act(() => {
      result.current.closeCreateModal();
    });
    expect(result.current.isCreateModalOpen).toBe(false);
  });

  it('tracks selection', () => {
    const { result } = renderHook(() => useJobsPage(SERVER_JOBS));

    act(() => {
      result.current.toggleSelection('1');
    });

    expect(result.current.isSelected('1')).toBe(true);
    expect(result.current.selectedJobIds).toEqual(['1']);

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedJobIds).toEqual([]);
  });
});
