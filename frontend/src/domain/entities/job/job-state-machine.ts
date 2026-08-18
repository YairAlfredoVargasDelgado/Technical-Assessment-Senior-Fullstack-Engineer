import type {
  CancelledJob,
  CompletedJob,
  DraftJob,
  InProgressJob,
  JobActionOf,
  JobActionType,
  JobState,
  JobStateOf,
  JobStatus,
  ScheduledJob,
} from './job-state';

/**
 * The `Job` state machine.
 *
 * ## One table, four consumers
 *
 * `JOB_TRANSITIONS` is the only place the lifecycle rules exist. Every other
 * function in this file is a projection of it, and every consumer reads one of
 * those projections:
 *
 * | Consumer | Reads | Used by |
 * |---|---|---|
 * | The type system | `keyof` the table | `transitionJob` — an illegal transition fails to compile |
 * | Which buttons render | `allowedActionsFor` | `useJobsPage` |
 * | Whether to call the API | `canTransition` | `TransitionJobUseCase` |
 * | The optimistic target status | `nextStatusFor` | `useCompleteJob` |
 *
 * That last row is the one worth noticing. Without it the optimistic-update hook
 * would hardcode `applyOptimisticStatus(id, 'InProgress')` — a second place
 * encoding "start leads to InProgress", which would silently disagree with this
 * table the first time a transition's target changed.
 *
 * ## Why each entry is `{ to, build }` rather than just a builder
 *
 * `nextStatusFor` needs the target status *without* constructing the next state,
 * because the caller holds an API row (`Job`) rather than a lifecycle union
 * (`JobState`). Storing `to` alongside the builder is what makes that possible
 * from the same table instead of from a second one.
 *
 * The risk that `to` and what `build` returns could disagree is closed by
 * `job-state-machine.test.ts`, which asserts they match for all 25
 * status × action combinations.
 *
 * ## Why each builder needs no narrowing
 *
 * Each entry is annotated with the exact source state it applies to, so
 * `Scheduled.start.build` receives a `ScheduledJob` and reads `assigneeId`
 * directly. There is no `if (current.status === 'Scheduled')` re-check, because
 * the table position already proves it.
 */

/** Shape every entry must conform to. Enforced by `satisfies` below. */
type TransitionTable = {
  readonly [TFrom in JobStatus]: {
    readonly [TAction in JobActionType]?: {
      readonly to: JobStatus;
      readonly build: (current: JobStateOf<TFrom>, action: JobActionOf<TAction>) => JobState;
    };
  };
};

export const JOB_TRANSITIONS = {
  Draft: {
    schedule: {
      to: 'Scheduled',
      build: (_current: DraftJob, action: JobActionOf<'schedule'>): ScheduledJob => ({
        status: 'Scheduled',
        scheduledDate: action.scheduledDate,
        assigneeId: action.assigneeId,
      }),
    },
  },

  Scheduled: {
    start: {
      to: 'InProgress',
      build: (current: ScheduledJob, action: JobActionOf<'start'>): InProgressJob => ({
        status: 'InProgress',
        startedAt: action.startedAt,
        assigneeId: current.assigneeId,
        photos: [],
      }),
    },
    cancel: {
      to: 'Cancelled',
      build: (_current: ScheduledJob, action: JobActionOf<'cancel'>): CancelledJob => ({
        status: 'Cancelled',
        cancelledAt: action.cancelledAt,
        reason: action.reason,
      }),
    },
  },

  InProgress: {
    complete: {
      to: 'Completed',
      build: (current: InProgressJob, action: JobActionOf<'complete'>): CompletedJob => ({
        status: 'Completed',
        startedAt: current.startedAt,
        completedAt: action.completedAt,
        assigneeId: current.assigneeId,
        photos: current.photos,
        signatureUrl: action.signatureUrl,
      }),
    },
    cancel: {
      to: 'Cancelled',
      build: (_current: InProgressJob, action: JobActionOf<'cancel'>): CancelledJob => ({
        status: 'Cancelled',
        cancelledAt: action.cancelledAt,
        reason: action.reason,
      }),
    },
  },

  /** Terminal. An empty entry makes `AllowedActionType<'Completed'>` resolve to `never`. */
  Completed: {},

  /** Terminal. */
  Cancelled: {},
} as const satisfies TransitionTable;

type Transitions = typeof JOB_TRANSITIONS;

/* -------------------------------------------------------------------------- */
/* Types derived from the table                                               */
/* -------------------------------------------------------------------------- */

/**
 * Actions legal from a given status.
 *
 * For the terminal states this is `never`, which is what makes
 * `transitionJob(completedJob, anyAction)` a compile error: no argument can
 * satisfy a parameter whose type is `never`.
 */
export type AllowedActionType<TStatus extends JobStatus> = Extract<
  keyof Transitions[TStatus],
  JobActionType
>;

/** The state produced by applying `TAction` to `TStatus`. */
export type NextState<
  TStatus extends JobStatus,
  TAction extends AllowedActionType<TStatus>,
> = Transitions[TStatus][TAction & keyof Transitions[TStatus]] extends {
  build: (...args: never[]) => infer TResult;
}
  ? TResult
  : never;

/* -------------------------------------------------------------------------- */
/* Runtime API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The dynamically-indexed view of the table.
 *
 * `JOB_TRANSITIONS[someStatus]` produces a union of entry records whose `keyof`
 * is their intersection — `never` — so TypeScript cannot resolve a key it must
 * look up at runtime (microsoft/TypeScript#30581). This one widening, confined to
 * a single private helper, is what the three runtime functions below share
 * instead of each performing their own cast.
 */
type DynamicEntry = {
  readonly to: JobStatus;
  readonly build: (current: never, action: never) => JobState;
};

function entryFor(status: JobStatus, actionType: JobActionType): DynamicEntry | undefined {
  const entries: Record<string, DynamicEntry> = JOB_TRANSITIONS[status];
  return entries[actionType];
}

/** Whether an action is legal from a status. Used by the UI to enable controls. */
export function canTransition(status: JobStatus, actionType: JobActionType): boolean {
  return entryFor(status, actionType) !== undefined;
}

/**
 * Every action legal from a status.
 *
 * Returned as a plain array so the presentation layer can map over it without
 * knowing anything about the machine's internals.
 */
export function allowedActionsFor(status: JobStatus): readonly JobActionType[] {
  return Object.keys(JOB_TRANSITIONS[status]) as readonly JobActionType[];
}

/**
 * The status an action leads to, or `null` when it is illegal.
 *
 * This is what an optimistic update needs: the caller holds an API row carrying
 * only a `JobStatus`, not a full `JobState`, so it cannot construct the next
 * state — but it can ask what status to paint while the request is in flight.
 *
 * Its existence is what keeps `'InProgress'` from being written a second time in
 * the presentation layer.
 */
export function nextStatusFor(status: JobStatus, actionType: JobActionType): JobStatus | null {
  return entryFor(status, actionType)?.to ?? null;
}

/**
 * Applies an action with the transition validated **at compile time**.
 *
 * ```ts
 * transitionJob(draft, { type: 'schedule', scheduledDate, assigneeId });  // ScheduledJob
 * transitionJob(draft, { type: 'complete', ... });                        // compile error
 * transitionJob(completed, { type: 'cancel', ... });                      // compile error
 * ```
 *
 * `TCurrent` is inferred from `current`, so the constraint on `TAction` resolves
 * to exactly the actions that status permits. The return type is computed from
 * the table rather than declared, so it stays correct as the machine evolves.
 *
 * Passing an un-narrowed `JobState` union is also a compile error: the allowed
 * actions of a union are the intersection of its members' actions, which the
 * terminal states reduce to `never`. That is the correct answer — narrow first.
 *
 * The single assertion below re-states, for the compiler, the guarantee the
 * signature already enforces: `entryFor` cannot return `undefined` for a pair
 * the constraint admitted. `job-state-machine.test.ts` exercises all 25
 * combinations to keep that true.
 */
export function transitionJob<
  TCurrent extends JobState,
  TAction extends JobActionOf<AllowedActionType<TCurrent['status']>>,
>(
  current: TCurrent,
  action: TAction,
): NextState<TCurrent['status'], TAction['type'] & AllowedActionType<TCurrent['status']>> {
  const entry = entryFor(current.status, action.type);

  if (entry === undefined) {
    // Unreachable through the type system; reachable if a caller crosses the
    // boundary with `any`, or if the table is edited without updating callers.
    throw new Error(`Illegal transition: cannot "${action.type}" a job in state "${current.status}".`);
  }

  return entry.build(current as never, action as never) as NextState<
    TCurrent['status'],
    TAction['type'] & AllowedActionType<TCurrent['status']>
  >;
}
