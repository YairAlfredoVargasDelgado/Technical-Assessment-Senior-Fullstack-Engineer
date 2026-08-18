'use client';

import { useEffect } from 'react';

interface JobsErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

/**
 * The route's error boundary.
 *
 * ## Why it must be a Client Component
 *
 * `reset` is a callback the user invokes, so this file needs interactivity. It is
 * the one place in the route where `'use client'` is unavoidable rather than
 * convenient — Next.js will not accept a Server Component here.
 *
 * ## What `digest` is, and why the message may be useless
 *
 * In production Next.js replaces server error messages with a generic string and
 * gives you a `digest` — a hash correlating this screen to the full stack trace in
 * the server logs. Showing it is the difference between a user saying "it broke"
 * and a user reading out an identifier that finds the exact request.
 *
 * ## Retry
 *
 * `reset()` re-renders the segment, which re-runs the Server Component and its
 * data fetch. For the failure this boundary actually sees most often — the API
 * being briefly unreachable — that is a real recovery and not a page reload.
 */
export default function JobsError({ error, reset }: JobsErrorProps) {
  useEffect(() => {
    // Client-side reporting hook. In production this is where Sentry or the
    // OpenTelemetry browser exporter receives the error; logging it keeps the
    // failure visible in the browser console in development.
    console.error('The jobs route failed to render:', error);
  }, [error]);

  return (
    <main className="page">
      <div className="card" role="alert" data-testid="jobs-route-error">
        <h1 className="page__title">Something went wrong</h1>

        <p className="page__subtitle" style={{ marginBottom: 16 }}>
          The job list could not be loaded. This is usually temporary.
        </p>

        <p className="alert alert--error" style={{ marginBottom: 16 }}>
          {error.message}
        </p>

        {error.digest !== undefined ? (
          <p className="field__hint" style={{ marginBottom: 16 }}>
            Reference: <code data-testid="jobs-route-error-digest">{error.digest}</code>
          </p>
        ) : null}

        <button type="button" className="button button--primary" onClick={reset} data-testid="jobs-route-error-retry">
          Try again
        </button>
      </div>
    </main>
  );
}
