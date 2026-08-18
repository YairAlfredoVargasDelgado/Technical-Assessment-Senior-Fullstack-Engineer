/**
 * The `Job` lifecycle, modelled as a discriminated union.
 *
 * Each state carries **only** the data that is meaningful while the job is in
 * that state. This is the whole point of the union: a `DraftJob` has no
 * `assigneeId` field to be `null`, and a `CompletedJob` cannot be missing its
 * `signatureUrl`. The alternative — one wide interface with every field
 * optional — pushes those guarantees into runtime checks scattered across the
 * UI, which is precisely the duplication this model exists to prevent.
 */

/** The discriminant. */
export type JobStatus = 'Draft' | 'Scheduled' | 'InProgress' | 'Completed' | 'Cancelled';

export interface DraftJob {
  readonly status: 'Draft';
  readonly notes?: string;
}

export interface ScheduledJob {
  readonly status: 'Scheduled';
  readonly scheduledDate: Date;
  readonly assigneeId: string;
}

export interface InProgressJob {
  readonly status: 'InProgress';
  readonly startedAt: Date;
  readonly assigneeId: string;
  readonly photos: readonly string[];
}

export interface CompletedJob {
  readonly status: 'Completed';
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly assigneeId: string;
  readonly photos: readonly string[];
  readonly signatureUrl: string;
}

export interface CancelledJob {
  readonly status: 'Cancelled';
  readonly cancelledAt: Date;
  readonly reason: string;
}

export type JobState = DraftJob | ScheduledJob | InProgressJob | CompletedJob | CancelledJob;

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * An action carries exactly the data the target state needs and the current
 * state cannot supply.
 *
 * `start` takes only `startedAt` because `assigneeId` is already on the
 * `ScheduledJob` it transitions from; `complete` takes only `completedAt` and
 * `signatureUrl` because `startedAt`, `assigneeId` and `photos` all carry over
 * from `InProgressJob`. Asking the caller to re-supply data the machine already
 * holds is how state machines drift out of sync with themselves.
 */
export type JobAction =
  | { readonly type: 'schedule'; readonly scheduledDate: Date; readonly assigneeId: string }
  | { readonly type: 'start'; readonly startedAt: Date }
  | { readonly type: 'complete'; readonly completedAt: Date; readonly signatureUrl: string }
  | { readonly type: 'cancel'; readonly cancelledAt: Date; readonly reason: string };

export type JobActionType = JobAction['type'];

/** Narrows the action union by its discriminant. */
export type JobActionOf<TType extends JobActionType> = Extract<JobAction, { type: TType }>;

/** Narrows the state union by its discriminant. */
export type JobStateOf<TStatus extends JobStatus> = Extract<JobState, { status: TStatus }>;
