import type { AppResult } from '@/domain/errors';
import type { Job, JobAddress, JobFilters, JobPage } from '@/domain/entities/job/job.entity';

/**
 * What the application layer needs from persistence.
 *
 * Declared here, in the layer that consumes it — the HTTP implementation in
 * `src/infrastructure` depends on this file, and this file depends on nothing
 * outside `src/domain`. That inversion is what lets a use case be tested with a
 * hand-written fake and no `fetch` mocking at all.
 */
export interface JobRepositoryPort {
  search(query: JobSearchQuery, signal?: AbortSignal): Promise<AppResult<JobPage>>;

  /**
   * Loads one job.
   *
   * Fails with `Job.NotFound` both when the identifier does not exist and when it
   * belongs to another organisation — the tenant filter makes the two
   * indistinguishable on purpose, so the API cannot be used to confirm that an
   * identifier is real.
   */
  getById(jobId: string, signal?: AbortSignal): Promise<AppResult<Job>>;

  create(input: CreateJobInput): Promise<AppResult<string>>;

  start(jobId: string): Promise<AppResult<void>>;

  complete(input: CompleteJobInput): Promise<AppResult<void>>;

  cancel(input: CancelJobInput): Promise<AppResult<void>>;
}

export interface JobSearchQuery {
  readonly filters?: Partial<JobFilters>;
  readonly cursor?: string | null;
  readonly limit?: number;
}

export interface CreateJobInput {
  readonly title: string;
  readonly description: string | null;

  /**
   * Composed rather than flattened into six sibling fields.
   *
   * The API's create endpoint takes the address flat, but that is a property of
   * the wire format, and flattening it is `HttpJobRepository`'s job — translating
   * to the transport is the whole reason that class exists. Repeating the six
   * fields here would restate `JobAddress` with nothing keeping the two in step.
   */
  readonly address: JobAddress;

  readonly customerId: string;
  readonly scheduledDateUtc: string | null;
  readonly assigneeId: string | null;
}

export interface CompleteJobInput {
  readonly jobId: string;
  readonly signatureUrl: string;
}

export interface CancelJobInput {
  readonly jobId: string;
  readonly reason: string;
}

export type { Job };
