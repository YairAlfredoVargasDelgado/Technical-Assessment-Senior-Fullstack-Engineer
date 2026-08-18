import { describe, expect, it } from 'vitest';

import { getJobSummary } from './job-summary';
import type { JobState } from './job-state';

const AT = new Date('2030-06-01T09:00:00.000Z');
const LATER = new Date('2030-06-02T17:30:00.000Z');

describe('getJobSummary', () => {
  it('describes a draft with notes', () => {
    expect(getJobSummary({ status: 'Draft', notes: 'Inspect north slope' })).toBe(
      'Draft — Inspect north slope',
    );
  });

  it('describes a draft without notes', () => {
    expect(getJobSummary({ status: 'Draft' })).toBe('Draft — no notes yet');
  });

  it('describes a scheduled job', () => {
    expect(getJobSummary({ status: 'Scheduled', scheduledDate: AT, assigneeId: 'crew-7' })).toBe(
      'Scheduled for 2030-06-01, assigned to crew-7',
    );
  });

  it('singularises a single photo', () => {
    expect(
      getJobSummary({ status: 'InProgress', startedAt: AT, assigneeId: 'crew-7', photos: ['a.jpg'] }),
    ).toBe('In progress since 2030-06-01 — 1 photo');
  });

  it('pluralises zero and many photos', () => {
    expect(
      getJobSummary({ status: 'InProgress', startedAt: AT, assigneeId: 'crew-7', photos: [] }),
    ).toBe('In progress since 2030-06-01 — 0 photos');

    expect(
      getJobSummary({
        status: 'InProgress',
        startedAt: AT,
        assigneeId: 'crew-7',
        photos: ['a.jpg', 'b.jpg'],
      }),
    ).toBe('In progress since 2030-06-01 — 2 photos');
  });

  it('describes a completed job', () => {
    expect(
      getJobSummary({
        status: 'Completed',
        startedAt: AT,
        completedAt: LATER,
        assigneeId: 'crew-7',
        photos: ['a.jpg', 'b.jpg'],
        signatureUrl: 'https://cdn.example/sig.png',
      }),
    ).toBe('Completed 2030-06-02 — 2 photos, signed off');
  });

  it('describes a cancelled job', () => {
    expect(getJobSummary({ status: 'Cancelled', cancelledAt: LATER, reason: 'Storm' })).toBe(
      'Cancelled 2030-06-02 — Storm',
    );
  });

  /**
   * The exhaustiveness guard is a compile-time device, but it also throws so the
   * boundary is covered when untyped data crosses it.
   */
  it('throws when handed a status that is not part of the union', () => {
    const rogue = { status: 'Archived' } as unknown as JobState;

    expect(() => getJobSummary(rogue)).toThrow(/Unhandled JobState/);
  });
});
