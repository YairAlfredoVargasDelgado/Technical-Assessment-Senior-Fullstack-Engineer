import Link from 'next/link';

/**
 * The 404 for this route segment.
 *
 * Reachable, not decorative: `app/jobs/[jobId]/page.tsx` calls `notFound()` when
 * the API reports that a job does not exist — or when it exists but belongs to
 * another organisation, which the tenant filter makes indistinguishable from
 * absence. That is the correct response to both: telling an attacker "this id
 * exists but is not yours" confirms the identifier.
 */
export default function JobNotFound() {
  return (
    <main className="page">
      <div className="card empty-state" data-testid="job-not-found">
        <h1 className="page__title">Job not found</h1>

        <p className="page__subtitle" style={{ marginBottom: 24 }}>
          This job does not exist, or it belongs to another organization.
        </p>

        <Link className="button button--primary" href="/jobs">
          Back to all jobs
        </Link>
      </div>
    </main>
  );
}
