import 'server-only';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { getJobSummary } from '@/domain/entities/job';
import type { JobState } from '@/domain/entities/job';
import type { Job } from '@/domain/entities/job/job.entity';
import type { AppResult } from '@/domain/errors';
import { container } from '@/infrastructure/container';
import { StatusBadge } from '@/presentation/components/atoms/status-badge.component';
import { JobsTableSkeleton } from '@/presentation/components/atoms/skeleton.component';

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
 * A single job.
 *
 * ## What this route is for
 *
 * It is what makes `not-found.tsx` reachable. A 404 file that nothing can trigger
 * is decoration; this route calls `notFound()` when the API reports the job does
 * not exist, so the custom 404 is a real code path with a real test.
 *
 * ## The same streaming pattern as the list
 *
 * The promise is created and handed unawaited to a component inside `<Suspense>`,
 * so the heading paints immediately and only the detail card streams in.
 */
export default async function JobDetailPage({ params }: { readonly params: Promise<{ jobId: string }> }) {
  // Next.js 15 made route params asynchronous.
  const { jobId } = await params;

  const jobPromise = container().getJob.execute(jobId);

  return (
    <main className="page" id="main-content">
      <div className="page__header">
        <div>
          <Link className="field__hint" href="/jobs">
            ← All jobs
          </Link>
          <h1 className="page__title">Job detail</h1>
        </div>
      </div>

      <Suspense fallback={<JobsTableSkeleton rows={3} />}>
        <JobDetail promise={jobPromise} />
      </Suspense>
    </main>
  );
}

async function JobDetail({ promise }: { readonly promise: Promise<AppResult<Job>> }) {
  const result = await promise;

  if (!result.ok) {
    // `Job.NotFound` covers both "no such job" and "belongs to another
    // organization" — the tenant filter makes them indistinguishable, which is
    // the correct response to both. Anything else is a genuine failure and is
    // thrown so `error.tsx` renders instead of a misleading 404.
    if (result.error.code === 'Job.NotFound') {
      notFound();
    }

    throw new Error(result.error.message);
  }

  const job = result.value;

  return (
    <article className="card" data-testid="job-detail">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }} data-testid="job-detail-title">
          {job.title}
        </h2>
        <StatusBadge status={job.status} />
      </header>

      {/*
        The Part 1 state machine, rendering a human-readable summary. It is the
        same discriminated union and the same exhaustive `never` check — reused
        here rather than reimplemented as a chain of conditionals.
      */}
      <p className="page__subtitle" data-testid="job-detail-summary">
        {getJobSummary(toJobState(job))}
      </p>

      <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '8px 24px', marginTop: 24 }}>
        <dt className="field__label">Address</dt>
        <dd style={{ margin: 0 }}>
          {job.address.street}, {job.address.city}, {job.address.state} {job.address.zipCode}
        </dd>

        <dt className="field__label">Customer</dt>
        <dd style={{ margin: 0 }}>
          <code>{job.customerId}</code>
        </dd>

        <dt className="field__label">Assignee</dt>
        <dd style={{ margin: 0 }}>{job.assigneeId === null ? 'Unassigned' : <code>{job.assigneeId}</code>}</dd>

        <dt className="field__label">Photos</dt>
        <dd style={{ margin: 0 }}>{job.photoCount}</dd>
      </dl>
    </article>
  );
}

/**
 * Projects the flat API row into the lifecycle union.
 *
 * The API returns a row where every state-specific field is nullable, because
 * that is what a table needs. `getJobSummary` needs the union, because that is
 * what makes its exhaustiveness check meaningful. This is the one function that
 * bridges the two representations — and having exactly one is what stops the
 * mapping being re-invented, slightly differently, wherever it is needed.
 *
 * The fallbacks exist because the row is the weaker type: a `Completed` row
 * without a `completedAt` is impossible by the backend's invariants, but the
 * *type* permits it, and this function must be total.
 */
function toJobState(job: Job): JobState {
  const scheduled = job.scheduledDateUtc === null ? new Date(0) : new Date(job.scheduledDateUtc);
  const assignee = job.assigneeId ?? '';
  const updated = new Date(job.updatedAtUtc);

  switch (job.status) {
    case 'Draft':
      return job.description === null
        ? { status: 'Draft' }
        : { status: 'Draft', notes: job.description };

    case 'Scheduled':
      return { status: 'Scheduled', scheduledDate: scheduled, assigneeId: assignee };

    case 'InProgress':
      return {
        status: 'InProgress',
        startedAt: updated,
        assigneeId: assignee,
        photos: Array.from({ length: job.photoCount }, (_, index) => `photo-${index}`),
      };

    case 'Completed':
      return {
        status: 'Completed',
        startedAt: scheduled,
        completedAt: updated,
        assigneeId: assignee,
        photos: Array.from({ length: job.photoCount }, (_, index) => `photo-${index}`),
        signatureUrl: '',
      };

    case 'Cancelled':
      return { status: 'Cancelled', cancelledAt: updated, reason: job.description ?? 'No reason recorded' };
  }
}
