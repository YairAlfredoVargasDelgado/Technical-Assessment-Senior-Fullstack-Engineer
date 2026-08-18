import type { AppResult } from '@/domain/errors';
import type { CreateJobInput, JobRepositoryPort } from '../ports/job-repository.port';

/**
 * Creates a job.
 *
 * A thin pass-through today, and deliberately so: input validation belongs to the
 * form's reducer (immediate, per-keystroke feedback) and the business invariants
 * belong to the backend aggregate, which is the only place that can enforce them
 * for every client. Re-checking either here would be a third statement of a rule
 * that already has an owner.
 *
 * It exists anyway because it is the seam. When creating a job also has to warm a
 * cache, emit an analytics event, or fan out to a second endpoint, that lands
 * here — and neither the Server Action above it nor the HTTP client below it
 * changes.
 */
export class CreateJobUseCase {
  public constructor(private readonly jobs: JobRepositoryPort) {}

  public execute(input: CreateJobInput): Promise<AppResult<string>> {
    return this.jobs.create(input);
  }
}
