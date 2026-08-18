import type { JobStatus } from './job-state';

/**
 * A job as the API returns it.
 *
 * ## Why this is not `JobState`
 *
 * `JobState` (see `job-state.ts`) models the *lifecycle*: a discriminated union
 * where each variant carries only the data that is meaningful in that state.
 * `Job` is the *row* — the flat, nullable-heavy shape a table renders and a JSON
 * payload carries.
 *
 * Collapsing the two would mean either losing the union's guarantees at the
 * transport boundary, or forcing every API response through a parser that
 * reconstructs the union. The two coexist and are connected by exactly one
 * thing: `status`, which is what the state machine takes as input to decide
 * which actions a row permits. That is how the machine from Part 1 drives this
 * UI rather than sitting beside it.
 */
export interface Job {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: JobStatus;
  readonly address: JobAddress;
  /** ISO-8601. Absent while the job is a draft. */
  readonly scheduledDateUtc: string | null;
  readonly assigneeId: string | null;
  readonly customerId: string;
  readonly photoCount: number;
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
}

export interface JobAddress {
  readonly street: string;
  readonly city: string;
  readonly state: string;
  readonly zipCode: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

/** One page of jobs plus the cursor for the next. Mirrors the API's `PagedList<T>`. */
export interface JobPage {
  readonly items: readonly Job[];
  readonly nextCursor: string | null;
  readonly hasNextPage: boolean;
}

/** The filters a search accepts. */
export interface JobFilters {
  readonly searchTerm: string;
  readonly statuses: readonly JobStatus[];
  readonly scheduledFrom: string | null;
  readonly scheduledTo: string | null;
  readonly assigneeId: string | null;
}

export const EMPTY_JOB_FILTERS: JobFilters = {
  searchTerm: '',
  statuses: [],
  scheduledFrom: null,
  scheduledTo: null,
  assigneeId: null,
};

/** Fields a job list may be sorted by, client-side, within the loaded page. */
export type JobSortField = 'title' | 'status' | 'scheduledDateUtc' | 'updatedAtUtc';

export interface JobSortConfig {
  readonly field: JobSortField;
  readonly direction: 'asc' | 'desc';
}

export const DEFAULT_JOB_SORT: JobSortConfig = {
  field: 'scheduledDateUtc',
  direction: 'asc',
};
