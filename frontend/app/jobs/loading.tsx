import { JobsTableSkeleton } from '@/presentation/components/atoms/skeleton.component';

/**
 * Route-level loading UI.
 *
 * Next.js wraps the route in a Suspense boundary with this as the fallback, so it
 * shows during *navigation* to `/jobs` — before `page.tsx` has begun to render.
 *
 * It is not the same boundary as the `<Suspense>` inside `page.tsx`. That one is
 * finer-grained: it lets the header and filter bar paint immediately while only
 * the table streams in. This one covers the gap before any of that exists. Having
 * both is what makes the transition seamless in either direction — and using the
 * same skeleton component in both is what stops them looking like two different
 * loading states.
 */
export default function JobsLoading() {
  return (
    <main className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Jobs</h1>
          <p className="page__subtitle">Loading…</p>
        </div>
      </div>

      <JobsTableSkeleton />
    </main>
  );
}
