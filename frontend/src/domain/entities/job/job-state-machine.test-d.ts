import { describe, expectTypeOf, it } from 'vitest';

import { transitionJob } from './job-state-machine';
import type { AllowedActionType } from './job-state-machine';
import type {
  CancelledJob,
  CompletedJob,
  DraftJob,
  InProgressJob,
  ScheduledJob,
} from './job-state';

const AT = new Date('2030-06-01T09:00:00.000Z');

const draft: DraftJob = { status: 'Draft' };
const scheduled: ScheduledJob = { status: 'Scheduled', scheduledDate: AT, assigneeId: 'crew-7' };
const inProgress: InProgressJob = {
  status: 'InProgress',
  startedAt: AT,
  assigneeId: 'crew-7',
  photos: [],
};
const completed: CompletedJob = {
  status: 'Completed',
  startedAt: AT,
  completedAt: AT,
  assigneeId: 'crew-7',
  photos: [],
  signatureUrl: 'https://cdn.example/sig.png',
};
const cancelled: CancelledJob = { status: 'Cancelled', cancelledAt: AT, reason: 'Storm' };

describe('AllowedActionType — derived from the transition table', () => {
  it('exposes only the legal actions per status', () => {
    expectTypeOf<AllowedActionType<'Draft'>>().toEqualTypeOf<'schedule'>();
    expectTypeOf<AllowedActionType<'Scheduled'>>().toEqualTypeOf<'start' | 'cancel'>();
    expectTypeOf<AllowedActionType<'InProgress'>>().toEqualTypeOf<'complete' | 'cancel'>();
  });

  it('resolves terminal states to never, which is what closes them at compile time', () => {
    expectTypeOf<AllowedActionType<'Completed'>>().toEqualTypeOf<never>();
    expectTypeOf<AllowedActionType<'Cancelled'>>().toEqualTypeOf<never>();
  });
});

describe('transitionJob — valid transitions infer the exact target state', () => {
  it('Draft -> Scheduled', () => {
    const next = transitionJob(draft, { type: 'schedule', scheduledDate: AT, assigneeId: 'crew-7' });
    expectTypeOf(next).toEqualTypeOf<ScheduledJob>();
  });

  it('Scheduled -> InProgress', () => {
    const next = transitionJob(scheduled, { type: 'start', startedAt: AT });
    expectTypeOf(next).toEqualTypeOf<InProgressJob>();
  });

  it('Scheduled -> Cancelled', () => {
    const next = transitionJob(scheduled, { type: 'cancel', cancelledAt: AT, reason: 'Storm' });
    expectTypeOf(next).toEqualTypeOf<CancelledJob>();
  });

  it('InProgress -> Completed', () => {
    const next = transitionJob(inProgress, {
      type: 'complete',
      completedAt: AT,
      signatureUrl: 'https://cdn.example/sig.png',
    });
    expectTypeOf(next).toEqualTypeOf<CompletedJob>();
  });

  it('InProgress -> Cancelled', () => {
    const next = transitionJob(inProgress, { type: 'cancel', cancelledAt: AT, reason: 'Storm' });
    expectTypeOf(next).toEqualTypeOf<CancelledJob>();
  });

  it('gives the narrowed result access to data carried across the transition', () => {
    const next = transitionJob(inProgress, {
      type: 'complete',
      completedAt: AT,
      signatureUrl: 'https://cdn.example/sig.png',
    });

    expectTypeOf(next.assigneeId).toEqualTypeOf<string>();
    expectTypeOf(next.signatureUrl).toEqualTypeOf<string>();
  });
});

describe('transitionJob — invalid transitions are compile errors', () => {
  it('rejects skipping ahead from Draft', () => {
    // @ts-expect-error Draft cannot be started
    transitionJob(draft, { type: 'start', startedAt: AT });
    // @ts-expect-error Draft cannot be completed
    transitionJob(draft, { type: 'complete', completedAt: AT, signatureUrl: 'u' });
    // @ts-expect-error Draft cannot be cancelled
    transitionJob(draft, { type: 'cancel', cancelledAt: AT, reason: 'r' });
  });

  it('rejects re-entering a state that has already been left', () => {
    // @ts-expect-error Scheduled cannot be re-scheduled
    transitionJob(scheduled, { type: 'schedule', scheduledDate: AT, assigneeId: 'crew-7' });
    // @ts-expect-error InProgress cannot be re-started
    transitionJob(inProgress, { type: 'start', startedAt: AT });
  });

  it('rejects skipping InProgress', () => {
    // @ts-expect-error Scheduled cannot jump straight to Completed
    transitionJob(scheduled, { type: 'complete', completedAt: AT, signatureUrl: 'u' });
  });

  it('closes the terminal states to every action', () => {
    // @ts-expect-error Completed is terminal
    transitionJob(completed, { type: 'cancel', cancelledAt: AT, reason: 'r' });
    // @ts-expect-error Completed is terminal
    transitionJob(completed, { type: 'start', startedAt: AT });
    // @ts-expect-error Cancelled is terminal
    transitionJob(cancelled, { type: 'start', startedAt: AT });
    // @ts-expect-error Cancelled is terminal
    transitionJob(cancelled, { type: 'schedule', scheduledDate: AT, assigneeId: 'crew-7' });
  });
});
