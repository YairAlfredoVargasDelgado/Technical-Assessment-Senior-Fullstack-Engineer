import 'server-only';

import { Suspense } from 'react';

import { container } from '@/infrastructure/container';
import { DEFAULT_PAGE_SIZE } from '@/presentation/stores/jobs.store';
import { JobsTableSkeleton } from '@/presentation/components/atoms/skeleton.component';
import { JobsView } from '@/presentation/views/jobs';
import type { JobPage } from '@/domain/entities/job/job.entity';
import type { AppResult } from '@/domain/errors';

/**
 * Rendered per request, never prerendered.
 *
 * Without this, `next build` treats the route as static, executes the data fetch
 * at build time and bakes the result into the output. For a multi-tenant,
 * authenticated page that is not a performance optimisation — it is a data leak:
 * whichever organisation's token the build machine happened to hold would be
 * served to every visitor.
 *
 * It also makes the build independent of the API being reachable, which is what
 * lets the frontend image be built in CI without standing up the backend.
 */
export const dynamic = 'force-dynamic';

/**
 * The `/jobs` route — a Server Component.
 *
 * ## `server-only`
 *
 * The import at the top makes it a build error for this module to be pulled into
 * a client bundle. It is belt-and-braces here (a `page.tsx` is server-side by
 * default) but it is load-bearing as documentation: it states that the container,
 * the API base URL and the access token below must never cross to the browser,
 * and it enforces that statement if someone later adds `'use client'` to this
 * file to "quickly add a hook".
 *
 * ## Fetching through the container, not a Server Action
 *
 * Server Actions are `POST` requests that run one at a time and opt the route out
 * of static optimisation. They are the right tool for mutations and the wrong one
 * for reads. This page asks the DI container for a use case and awaits the result
 * — no HTTP, no `fetch`, no knowledge of where jobs come from.
 *
 * ## The reason nothing is awaited here
 *
 * This is the detail that makes the `<Suspense>` below mean something.
 *
 * If this component were `async` and awaited the search, the page would send
 * nothing until the API replied — the header, the filter bar and the skeleton
 * would all wait on the slowest thing on the screen, and the Suspense boundary
 * would never suspend because its child was already resolved.
 *
 * Instead the promise is *created* here and handed, unawaited, to a nested async
 * component inside the boundary. React streams the shell immediately, shows the
 * skeleton in the boundary's place, and patches in the table when the promise
 * settles. Same total time, first paint an order of magnitude sooner.
 */
export default function JobsPage() {
  // Deliberately not awaited. See above.
  const jobsPromise = container().searchJobs.execute({ limit: DEFAULT_PAGE_SIZE });

  return (
    <main className="page" id="main-content">
      <div className="page__header">
        <div>
          <h1 className="page__title">Jobs</h1>
          <p className="page__subtitle">Create, schedule and complete roofing work.</p>
        </div>
      </div>

      <Suspense fallback={<JobsTableSkeleton />}>
        <JobsLoader promise={jobsPromise} />
      </Suspense>
    </main>
  );
}

/**
 * Awaits the page's data and hands it to the client view.
 *
 * A separate component purely so the `await` happens *inside* the Suspense
 * boundary rather than above it. That is the whole mechanism: React suspends on
 * the component that awaits, not on the one that created the promise.
 *
 * A failed result is thrown rather than rendered. `error.tsx` is the route's
 * error UI and it only sees thrown errors — handling the failure here would mean
 * building a second error screen beside the one the framework already provides.
 */
async function JobsLoader({ promise }: { readonly promise: Promise<AppResult<JobPage>> }) {
  const result = await promise;

  if (!result.ok) {
    throw new Error(result.error.message);
  }

  return (
    <JobsView
      initialJobs={result.value.items}
      initialCursor={result.value.nextCursor}
      initialHasNextPage={result.value.hasNextPage}
    />
  );
}
