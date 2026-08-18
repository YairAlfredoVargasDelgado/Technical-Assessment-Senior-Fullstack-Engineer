import type { Job } from '@/domain/entities/job/job.entity';
import type { AppResult } from '@/domain/errors';
import type { JobRepositoryPort } from '../ports/job-repository.port';

/**
 * Loads a single job for the detail route.
 *
 * Separate from `SearchJobsUseCase` rather than a `limit: 1` search: "find the
 * one with this id" and "find the ones matching these filters" are different
 * questions with different failure modes. Collapsing them would make the detail
 * page's not-found case indistinguishable from an empty result set — and the two
 * render very differently.
 */
export class GetJobUseCase {
  public constructor(private readonly jobs: JobRepositoryPort) {}

  public execute(jobId: string, signal?: AbortSignal): Promise<AppResult<Job>> {
    return this.jobs.getById(jobId, signal);
  }
}
