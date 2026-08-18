import { describe, expect, it } from 'vitest';

import { allowedActionsFor, canTransition, JOB_TRANSITIONS, nextStatusFor } from './job-state-machine';
import type {
  CancelledJob,
  CompletedJob,
  DraftJob,
  InProgressJob,
  JobAction,
  JobActionType,
  JobState,
  JobStatus,
  ScheduledJob,
} from './job-state';

const AT = new Date('2030-06-01T09:00:00.000Z');
const LATER = new Date('2030-06-01T17:30:00.000Z');

const draft: DraftJob = { status: 'Draft', notes: 'Inspect north slope' };
const scheduled: ScheduledJob = { status: 'Scheduled', scheduledDate: AT, assigneeId: 'crew-7' };
const inProgress: InProgressJob = {
  status: 'InProgress',
  startedAt: AT,
  assigneeId: 'crew-7',
  photos: ['before.jpg'],
};
const completed: CompletedJob = {
  status: 'Completed',
  startedAt: AT,
  completedAt: LATER,
  assigneeId: 'crew-7',
  photos: ['before.jpg', 'after.jpg'],
  signatureUrl: 'https://cdn.example/sig.png',
};
const cancelled: CancelledJob = { status: 'Cancelled', cancelledAt: LATER, reason: 'Storm' };

const STATES: Readonly<Record<JobStatus, JobState>> = {
  Draft: draft,
  Scheduled: scheduled,
  InProgress: inProgress,
  Completed: completed,
  Cancelled: cancelled,
};

const ACTIONS: Readonly<Record<JobActionType, JobAction>> = {
  schedule: { type: 'schedule', scheduledDate: AT, assigneeId: 'crew-7' },
  start: { type: 'start', startedAt: AT },
  complete: { type: 'complete', completedAt: LATER, signatureUrl: 'https://cdn.example/sig.png' },
  cancel: { type: 'cancel', cancelledAt: LATER, reason: 'Storm' },
};

/**
 * The specification's transition rules, written out independently of the
 * implementation.
 *
 * This is deliberately a *second* statement of the rules rather than a read of
 * `JOB_TRANSITIONS`: a test that derives its expectations from the code under
 * test can only prove the code is self-consistent, never that it is correct.
 */
const LEGAL: Readonly<Record<JobStatus, readonly JobActionType[]>> = {
  Draft: ['schedule'],
  Scheduled: ['start', 'cancel'],
  InProgress: ['complete', 'cancel'],
  Completed: [],
  Cancelled: [],
};

const EXPECTED_TARGET: Readonly<Partial<Record<`${JobStatus}:${JobActionType}`, JobStatus>>> = {
  'Draft:schedule': 'Scheduled',
  'Scheduled:start': 'InProgress',
  'Scheduled:cancel': 'Cancelled',
  'InProgress:complete': 'Completed',
  'InProgress:cancel': 'Cancelled',
};

const ALL_STATUSES = Object.keys(STATES) as readonly JobStatus[];
const ALL_ACTIONS = Object.keys(ACTIONS) as readonly JobActionType[];

/**
 * Applies a transition dynamically, the way the machine does internally.
 *
 * Defined here rather than exported from the module: production code either
 * knows the state statically (`transitionJob`) or only needs the target status
 * (`nextStatusFor`). An exported dynamic dispatcher would be an API that exists
 * solely because a test wanted it.
 */
function build(current: JobState, action: JobAction): JobState {
  const entries: Record<string, { build: (c: never, a: never) => JobState }> =
    JOB_TRANSITIONS[current.status];

  const entry = entries[action.type];
  if (entry === undefined) {
    throw new Error(`No transition for ${current.status} + ${action.type}`);
  }

  return entry.build(current as never, action as never);
}

describe('Job state machine — full transition matrix', () => {
  /** Every one of the 5 x 4 combinations, legal and illegal alike. */
  for (const status of ALL_STATUSES) {
    for (const actionType of ALL_ACTIONS) {
      const isLegal = LEGAL[status].includes(actionType);
      const verdict = isLegal ? 'allows' : 'rejects';

      it(`${verdict} "${actionType}" from "${status}"`, () => {
        const current = STATES[status];
        const action = ACTIONS[actionType];

        expect(canTransition(status, actionType)).toBe(isLegal);

        const target = nextStatusFor(status, actionType);

        if (!isLegal) {
          expect(target).toBeNull();
          return;
        }

        expect(target).toBe(EXPECTED_TARGET[`${status}:${actionType}`]);

        // The declared `to` must equal the status the builder actually produces.
        // Storing both is what lets `nextStatusFor` answer without constructing a
        // state; this is the assertion that stops the two drifting apart.
        expect(build(current, action).status).toBe(target);
      });
    }
  }
});

describe('allowedActionsFor', () => {
  for (const status of ALL_STATUSES) {
    it(`reports exactly the legal actions for "${status}"`, () => {
      expect([...allowedActionsFor(status)].sort()).toEqual([...LEGAL[status]].sort());
    });
  }

  it('reports terminal states as having no available action', () => {
    expect(allowedActionsFor('Completed')).toHaveLength(0);
    expect(allowedActionsFor('Cancelled')).toHaveLength(0);
  });
});

describe('transition payloads', () => {
  it('carries assigneeId forward from Scheduled into InProgress', () => {
    const next = build(scheduled, ACTIONS.start);

    expect(next).toEqual({
      status: 'InProgress',
      startedAt: AT,
      assigneeId: 'crew-7',
      photos: [],
    });
  });

  it('carries startedAt, assigneeId and photos forward from InProgress into Completed', () => {
    const next = build(inProgress, ACTIONS.complete);

    expect(next).toEqual({
      status: 'Completed',
      startedAt: AT,
      completedAt: LATER,
      assigneeId: 'crew-7',
      photos: ['before.jpg'],
      signatureUrl: 'https://cdn.example/sig.png',
    });
  });

  it('records the reason when cancelling', () => {
    expect(build(inProgress, ACTIONS.cancel)).toEqual({
      status: 'Cancelled',
      cancelledAt: LATER,
      reason: 'Storm',
    });
  });

  it('never mutates the state it transitions from', () => {
    const snapshot = structuredClone(scheduled);
    build(scheduled, ACTIONS.start);

    expect(scheduled).toEqual(snapshot);
  });
});
