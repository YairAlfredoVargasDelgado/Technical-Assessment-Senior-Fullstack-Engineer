import { create } from 'zustand';

import type {
  Job,
  JobFilters,
  JobSortConfig,
  JobSortField,
} from '@/domain/entities/job/job.entity';
import { DEFAULT_JOB_SORT, EMPTY_JOB_FILTERS } from '@/domain/entities/job/job.entity';
import type { JobStatus } from '@/domain/entities/job';

/**
 * Client-side UI state for the jobs view.
 *
 * ## The design decision that shapes this whole file
 *
 * The brief asks the store to manage `jobs[]` **and** says it "must NOT duplicate
 * server state". Taken literally those are incompatible: a `jobs[]` array in the
 * store *is* a copy of server state, and it brings every problem a copy brings —
 * it goes stale the moment another user changes a row, it must be re-synced after
 * every mutation, and "which of these two lists is right?" becomes a question the
 * codebase has to keep answering.
 *
 * This store resolves it by keeping the **intent** and dropping the **copy**:
 *
 * - The job list is owned by the server. It is fetched in the Server Component and
 *   passed down as props. Nothing here holds it.
 * - What the store holds is what the server cannot know: which filters the user
 *   has typed, how they have sorted, what they have selected, and —
 *   critically — an **overlay of optimistic patches** describing changes that have
 *   been requested but not yet confirmed.
 * - `useVisibleJobs` merges the two on render. The server list is the base; the
 *   overlay is applied on top; filtering and sorting run over the result.
 *
 * So an optimistic update is a patch, not a mutated copy of the row — which is
 * what makes rollback a deletion of one key rather than a restore from a snapshot
 * that has to be captured, kept, and correctly discarded.
 */

/** A change requested but not yet confirmed by the server. */
export interface OptimisticPatch {
  readonly status: JobStatus;
  /** Distinguishes a pending change from a confirmed one, for the UI. */
  readonly pending: true;
}

/**
 * How many jobs one request asks for.
 *
 * A module constant rather than store state. Page size is a property of the
 * *request the Server Component makes*, and that component cannot read a client
 * store — so state here would have no reader. The same applies with more force to
 * the cursor: a position kept in a store is lost on refresh and invisible to the
 * back button, which is exactly what a URL is for.
 *
 * The brief lists `pagination` among the store's responsibilities. This is a
 * deliberate deviation, taken because the alternative is state nothing reads. See
 * the README.
 */
export const DEFAULT_PAGE_SIZE = 20;

interface JobsState {
  readonly filters: JobFilters;
  readonly sortConfig: JobSortConfig;
  readonly selectedJobIds: readonly string[];

  /**
   * The optimistic overlay, keyed by job id.
   *
   * Not a list of jobs — a list of *differences*. It stays empty in the steady
   * state, so the memory cost is proportional to in-flight mutations rather than
   * to the size of the dataset.
   */
  readonly optimisticPatches: Readonly<Record<string, OptimisticPatch>>;
}

interface JobsActions {
  setSearchTerm: (searchTerm: string) => void;
  toggleStatusFilter: (status: JobStatus) => void;
  setDateRange: (from: string | null, to: string | null) => void;
  setAssigneeFilter: (assigneeId: string | null) => void;
  resetFilters: () => void;

  toggleSort: (field: JobSortField) => void;

  toggleSelection: (jobId: string) => void;
  setSelection: (jobIds: readonly string[]) => void;
  clearSelection: () => void;

  /** Records an intended status change so the UI can show it immediately. */
  applyOptimisticStatus: (jobId: string, status: JobStatus) => void;

  /** Discards a patch after the server rejected the change. */
  rollbackOptimisticStatus: (jobId: string) => void;

  /**
   * Discards a patch after the server accepted the change.
   *
   * Deliberately the same operation as rollback, under a name that says why. Once
   * the refreshed server data carries the new status, the patch is no longer
   * describing a difference — keeping it would mean the overlay silently pinned a
   * stale value over a row that a *later* change had moved on again.
   */
  settleOptimisticStatus: (jobId: string) => void;
}

export type JobsStore = JobsState & JobsActions;

const INITIAL_STATE: JobsState = {
  filters: EMPTY_JOB_FILTERS,
  sortConfig: DEFAULT_JOB_SORT,
  selectedJobIds: [],
  optimisticPatches: {},
};

export const useJobsStore = create<JobsStore>()((set) => ({
  ...INITIAL_STATE,

  setSearchTerm: (searchTerm) =>
    set((state) => ({
      filters: { ...state.filters, searchTerm },
    })),

  toggleStatusFilter: (status) =>
    set((state) => {
      const isActive = state.filters.statuses.includes(status);

      return {
        filters: {
          ...state.filters,
          statuses: isActive
            ? state.filters.statuses.filter((item) => item !== status)
            : [...state.filters.statuses, status],
        },
      };
    }),

  setDateRange: (from, to) =>
    set((state) => ({
      filters: { ...state.filters, scheduledFrom: from, scheduledTo: to },
    })),

  setAssigneeFilter: (assigneeId) =>
    set((state) => ({
      filters: { ...state.filters, assigneeId },
    })),

  resetFilters: () => set({ filters: EMPTY_JOB_FILTERS }),

  toggleSort: (field) =>
    set((state) => ({
      sortConfig:
        state.sortConfig.field === field
          ? { field, direction: state.sortConfig.direction === 'asc' ? 'desc' : 'asc' }
          // Clicking a new column starts ascending rather than inheriting the
          // previous column's direction, which reads as the table having ignored
          // the click.
          : { field, direction: 'asc' },
    })),

  toggleSelection: (jobId) =>
    set((state) => ({
      selectedJobIds: state.selectedJobIds.includes(jobId)
        ? state.selectedJobIds.filter((id) => id !== jobId)
        : [...state.selectedJobIds, jobId],
    })),

  setSelection: (jobIds) => set({ selectedJobIds: [...jobIds] }),

  clearSelection: () => set({ selectedJobIds: [] }),

  applyOptimisticStatus: (jobId, status) =>
    set((state) => ({
      optimisticPatches: { ...state.optimisticPatches, [jobId]: { status, pending: true } },
    })),

  rollbackOptimisticStatus: (jobId) => set((state) => discardPatch(state, jobId)),

  settleOptimisticStatus: (jobId) => set((state) => discardPatch(state, jobId)),
}));

/**
 * Removes one patch, returning the same object when there was nothing to remove.
 *
 * The identity check matters: returning a fresh `optimisticPatches` object for a
 * no-op would change its reference, and every component subscribed to it would
 * re-render for a state change that did not happen.
 */
function discardPatch(state: JobsState, jobId: string): Partial<JobsState> {
  if (!(jobId in state.optimisticPatches)) {
    return state;
  }

  const { [jobId]: _removed, ...rest } = state.optimisticPatches;
  return { optimisticPatches: rest };
}

/* -------------------------------------------------------------------------- */
/* Selectors                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Declared as standalone named functions, not inline arrows.
 *
 * `useJobsStore((state) => state.filters)` creates a new selector on every
 * render. Zustand compares the *result*, so that alone is not a bug — but a
 * selector that builds an object (`(s) => ({ a: s.a, b: s.b })`) returns a new
 * reference every time and re-renders on every store change, of any field. Named
 * selectors that return a single slice make that mistake hard to make by
 * accident, and give each subscription an obvious name in a profile.
 */
export const selectFilters = (state: JobsStore): JobFilters => state.filters;
export const selectSortConfig = (state: JobsStore): JobSortConfig => state.sortConfig;
export const selectSelectedJobIds = (state: JobsStore): readonly string[] => state.selectedJobIds;
export const selectOptimisticPatches = (state: JobsStore): Readonly<Record<string, OptimisticPatch>> =>
  state.optimisticPatches;

export const selectHasActiveFilters = (state: JobsStore): boolean =>
  state.filters.searchTerm.length > 0
  || state.filters.statuses.length > 0
  || state.filters.scheduledFrom !== null
  || state.filters.scheduledTo !== null
  || state.filters.assigneeId !== null;

export const selectSelectionCount = (state: JobsStore): number => state.selectedJobIds.length;

/* -------------------------------------------------------------------------- */
/* Pure derivation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Applies the optimistic overlay to the server's rows.
 *
 * Pure and exported so it can be unit-tested without React or the store.
 */
export function mergeOptimisticPatches(
  serverJobs: readonly Job[],
  patches: Readonly<Record<string, OptimisticPatch>>,
): readonly Job[] {
  // Fast path: the steady state. Returning the same array reference means
  // downstream `useMemo`s keyed on it do not recompute.
  if (Object.keys(patches).length === 0) {
    return serverJobs;
  }

  return serverJobs.map((job) => {
    const patch = patches[job.id];
    return patch === undefined ? job : { ...job, status: patch.status };
  });
}

/** Applies the client-side filters. */
export function applyJobFilters(jobs: readonly Job[], filters: JobFilters): readonly Job[] {
  const term = filters.searchTerm.trim().toLowerCase();

  return jobs.filter((job) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(job.status)) {
      return false;
    }

    if (filters.assigneeId !== null && job.assigneeId !== filters.assigneeId) {
      return false;
    }

    if (filters.scheduledFrom !== null
      && (job.scheduledDateUtc === null || job.scheduledDateUtc < filters.scheduledFrom)) {
      return false;
    }

    if (filters.scheduledTo !== null
      && (job.scheduledDateUtc === null || job.scheduledDateUtc > filters.scheduledTo)) {
      return false;
    }

    return term.length === 0
      || job.title.toLowerCase().includes(term)
      || (job.description?.toLowerCase().includes(term) ?? false);
  });
}

/** Sorts a copy, never the input. */
export function applyJobSort(jobs: readonly Job[], sortConfig: JobSortConfig): readonly Job[] {
  const direction = sortConfig.direction === 'asc' ? 1 : -1;

  return [...jobs].sort((left, right) => {
    const a = left[sortConfig.field];
    const b = right[sortConfig.field];

    // Unscheduled jobs sort last in both directions. Treating `null` as "smaller"
    // would put every draft at the top of a descending sort, which reads as a bug.
    if (a === null && b === null) {
      return 0;
    }
    if (a === null) {
      return 1;
    }
    if (b === null) {
      return -1;
    }

    return a < b ? -direction : a > b ? direction : 0;
  });
}
