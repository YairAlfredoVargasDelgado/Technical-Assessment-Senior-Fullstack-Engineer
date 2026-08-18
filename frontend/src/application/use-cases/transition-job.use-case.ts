import { canTransition } from '@/domain/entities/job';
import type { JobActionType, JobStatus } from '@/domain/entities/job';
import type { AppResult } from '@/domain/errors';
import { err } from '@/domain/errors';
import type { CancelJobInput, CompleteJobInput, JobRepositoryPort } from '../ports/job-repository.port';

/**
 * Moves a job through its lifecycle.
 *
 * ## The one place the client-side state machine is enforced
 *
 * `canTransition` is the same table that types `transitionJob` and that renders
 * the action buttons. Checking it here is not a duplicate of the backend's
 * aggregate — it is a different guarantee at a different distance:
 *
 * - the **backend** decides authoritatively, for every client, and is the only
 *   check that can be trusted;
 * - this check saves a round trip for a transition the client can already prove
 *   illegal, and gives the user an immediate, specific message instead of a
 *   spinner followed by a 409.
 *
 * It is safe to have both precisely because neither is the source of truth for
 * the other: remove this one and the system is still correct, only slower and
 * ruder. Remove the backend one and it is broken.
 */
export class TransitionJobUseCase {
  public constructor(private readonly jobs: JobRepositoryPort) {}

  public async start(jobId: string, currentStatus: JobStatus): Promise<AppResult<void>> {
    const guard = guardTransition(currentStatus, 'start');
    return guard ?? this.jobs.start(jobId);
  }

  public async complete(input: CompleteJobInput, currentStatus: JobStatus): Promise<AppResult<void>> {
    const guard = guardTransition(currentStatus, 'complete');
    return guard ?? this.jobs.complete(input);
  }

  public async cancel(input: CancelJobInput, currentStatus: JobStatus): Promise<AppResult<void>> {
    const guard = guardTransition(currentStatus, 'cancel');
    return guard ?? this.jobs.cancel(input);
  }
}

/**
 * Returns a failed result when the transition is illegal, or `null` to proceed.
 *
 * The error code matches the backend's (`Job.InvalidTransition`) so the UI has one
 * branch to handle regardless of which side rejected it.
 */
function guardTransition(
  currentStatus: JobStatus,
  action: JobActionType,
): AppResult<void> | null {
  return canTransition(currentStatus, action)
    ? null
    : err({
        code: 'Job.InvalidTransition',
        message: `A job in state "${currentStatus}" cannot be ${DESCRIPTIONS[action]}.`,
      });
}

const DESCRIPTIONS: Readonly<Record<JobActionType, string>> = {
  schedule: 'scheduled',
  start: 'started',
  complete: 'completed',
  cancel: 'cancelled',
};
