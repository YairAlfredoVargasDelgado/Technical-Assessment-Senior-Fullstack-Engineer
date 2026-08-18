import type { JobPage } from '@/domain/entities/job/job.entity';
import type { AppResult } from '@/domain/errors';
import type { JobRepositoryPort, JobSearchQuery } from '../ports/job-repository.port';

/**
 * Fetches a page of jobs.
 *
 * ## Why a use case and not a call to `fetch`
 *
 * The Server Component is not allowed to know that jobs arrive over HTTP. It asks
 * the container for this use case and awaits it; the container decides what is
 * behind the port. That is the whole reason the DI container exists on the
 * frontend, and what makes the page renderable in a test against an in-memory
 * repository without a network stub.
 *
 * ## Why it takes an `AbortSignal`
 *
 * A Server Component render can be cancelled — the user navigates away mid-stream.
 * Threading the signal through means the in-flight request is dropped rather than
 * held open until it times out.
 */
export class SearchJobsUseCase {
  public constructor(private readonly jobs: JobRepositoryPort) {}

  public execute(query: JobSearchQuery = {}, signal?: AbortSignal): Promise<AppResult<JobPage>> {
    return this.jobs.search(query, signal);
  }
}
