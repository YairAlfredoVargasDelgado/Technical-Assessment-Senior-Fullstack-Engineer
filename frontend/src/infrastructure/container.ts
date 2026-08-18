import 'server-only';

import { CreateJobUseCase } from '@/application/use-cases/create-job.use-case';
import { LoadDirectoryUseCase } from '@/application/use-cases/load-directory.use-case';
import { GetJobUseCase } from '@/application/use-cases/get-job.use-case';
import { SearchJobsUseCase } from '@/application/use-cases/search-jobs.use-case';
import { TransitionJobUseCase } from '@/application/use-cases/transition-job.use-case';
import type { JobRepositoryPort } from '@/application/ports/job-repository.port';
import type { DirectoryPort } from '@/application/ports/directory.port';

import { HttpJobRepository } from './http/http-job-repository';
import { HttpDirectoryRepository } from './http/http-directory.repository';

/**
 * The composition root.
 *
 * ## Why a frontend has one at all
 *
 * The brief asks the Server Component to fetch through "a use case from the DI
 * container". That is not ceremony imported from the backend — it is what makes
 * `page.tsx` independent of HTTP. The page asks for `searchJobs` and awaits it;
 * this file is the only place that decides an HTTP client is behind it, and it is
 * the only file that has to change to put something else there.
 *
 * ## Why it is hand-written and not a framework
 *
 * A container library (InversifyJS, tsyringe) buys decorators, reflection metadata
 * and a runtime resolution graph. For a dependency graph this small, that is
 * machinery whose failures are runtime "cannot resolve token" errors, replacing a
 * graph the compiler already checks. Twenty lines of explicit construction give
 * the same inversion with full type checking.
 *
 * ## Why it is a module-level singleton
 *
 * `HttpJobRepository` is stateless, so one instance serves every request safely.
 * Constructing a fresh graph per request would allocate on every render for no
 * benefit — and would defeat the token cache, turning one token request into one
 * per page view.
 *
 * `server-only` makes importing this from a Client Component a build error, which
 * is what stops the API base URL and the token provider being bundled for the
 * browser.
 */
class Container {
  private readonly jobRepository: JobRepositoryPort = new HttpJobRepository();

  public readonly searchJobs: SearchJobsUseCase = new SearchJobsUseCase(this.jobRepository);

  public readonly createJob: CreateJobUseCase = new CreateJobUseCase(this.jobRepository);

  public readonly getJob: GetJobUseCase = new GetJobUseCase(this.jobRepository);

  public readonly transitionJob: TransitionJobUseCase = new TransitionJobUseCase(this.jobRepository);

  private readonly directory: DirectoryPort = new HttpDirectoryRepository();

  public readonly loadDirectory: LoadDirectoryUseCase = new LoadDirectoryUseCase(this.directory);
}

let instance: Container | null = null;

/**
 * The container.
 *
 * A function rather than an exported constant so construction is lazy: `next
 * build` imports every module to collect route metadata, and eager construction
 * would run the repository's constructor — and any configuration it reads — at
 * build time on a machine with no runtime environment.
 */
export function container(): Container {
  instance ??= new Container();
  return instance;
}

export type { Container };
