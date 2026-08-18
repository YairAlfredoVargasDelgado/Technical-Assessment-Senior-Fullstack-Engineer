import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JobRepositoryPort } from '../ports/job-repository.port';

import { TransitionJobUseCase } from './transition-job.use-case';

/**
 * A hand-written fake, not a `fetch` mock.
 *
 * This is the payoff of declaring `JobRepositoryPort` in the application layer:
 * the use case can be tested against a plain object with no network, no HTTP
 * status codes, and no knowledge that an API exists.
 */
function fakeRepository(): JobRepositoryPort & { readonly calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    search: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    start: vi.fn(async () => {
      calls.push('start');
      return { ok: true as const, value: undefined };
    }),
    complete: vi.fn(async () => {
      calls.push('complete');
      return { ok: true as const, value: undefined };
    }),
    cancel: vi.fn(async () => {
      calls.push('cancel');
      return { ok: true as const, value: undefined };
    }),
  };
}

let repository: ReturnType<typeof fakeRepository>;
let useCase: TransitionJobUseCase;

beforeEach(() => {
  repository = fakeRepository();
  useCase = new TransitionJobUseCase(repository);
});

describe('TransitionJobUseCase — legal transitions reach the repository', () => {
  it('starts a scheduled job', async () => {
    const result = await useCase.start('job-1', 'Scheduled');

    expect(result.ok).toBe(true);
    expect(repository.calls).toEqual(['start']);
  });

  it('completes a job in progress', async () => {
    const result = await useCase.complete({ jobId: 'job-1', signatureUrl: 'https://x/y.png' }, 'InProgress');

    expect(result.ok).toBe(true);
    expect(repository.calls).toEqual(['complete']);
  });

  it('cancels a scheduled job', async () => {
    const result = await useCase.cancel({ jobId: 'job-1', reason: 'Storm' }, 'Scheduled');

    expect(result.ok).toBe(true);
    expect(repository.calls).toEqual(['cancel']);
  });
});

describe('TransitionJobUseCase — illegal transitions are refused without a round trip', () => {
  /**
   * The guard consults `canTransition`, the same table that types
   * `transitionJob` and that renders the action buttons. It does not replace the
   * backend's check — it saves a round trip for a transition the client can
   * already prove illegal, and gives the user a specific message rather than a
   * spinner followed by a 409.
   */
  it('refuses to start a draft', async () => {
    const result = await useCase.start('job-1', 'Draft');

    expect(result.ok).toBe(false);
    expect(repository.calls).toEqual([]);
  });

  it('refuses to complete a scheduled job', async () => {
    const result = await useCase.complete({ jobId: 'job-1', signatureUrl: 'https://x/y.png' }, 'Scheduled');

    expect(result.ok).toBe(false);
    expect(repository.calls).toEqual([]);
  });

  it('refuses every action on a terminal job', async () => {
    const outcomes = await Promise.all([
      useCase.start('job-1', 'Completed'),
      useCase.cancel({ jobId: 'job-1', reason: 'r' }, 'Completed'),
      useCase.start('job-1', 'Cancelled'),
      useCase.complete({ jobId: 'job-1', signatureUrl: 'https://x/y.png' }, 'Cancelled'),
    ]);

    expect(outcomes.every((outcome) => !outcome.ok)).toBe(true);
    expect(repository.calls).toEqual([]);
  });

  it('reports the same error code the backend would', async () => {
    const result = await useCase.start('job-1', 'Draft');

    // One code, so the UI has one branch to handle regardless of which side
    // rejected the transition.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('Job.InvalidTransition');
      expect(result.error.message).toContain('Draft');
    }
  });
});
