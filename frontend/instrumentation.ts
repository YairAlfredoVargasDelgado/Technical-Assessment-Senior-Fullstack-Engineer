import { registerOTel } from '@vercel/otel';

/**
 * OpenTelemetry for the Next.js server runtime.
 *
 * Next.js calls `register()` once, before any route handler or Server Component
 * runs — which is what makes it the right place to install instrumentation.
 *
 * ## What this buys: one trace across two runtimes
 *
 * `registerOTel` instruments `fetch`, so every call `HttpJobRepository` makes
 * carries a W3C `traceparent` header. ASP.NET Core's instrumentation reads that
 * header and continues the same trace rather than starting a new one, so a single
 * span tree in Jaeger runs:
 *
 * ```
 *   GET /jobs                        (Next.js server)
 *     └── GET /api/jobs              (fetch, traceparent propagated)
 *           └── ASP.NET Core request (.NET)
 *                 └── EF Core query
 *                       └── Npgsql   (the actual SQL)
 *   ```
 *
 * Without the propagation the two halves appear as unrelated traces, and "why was
 * this page slow?" becomes two separate investigations that have to be correlated
 * by timestamp.
 *
 * ## Why the guard
 *
 * Next.js also runs this file in the Edge runtime, where the Node SDK's
 * dependencies are unavailable. Registering only for `nodejs` keeps the Edge
 * build working — and there is nothing to trace there, since the API calls all
 * happen in the Node runtime.
 */
export function register(): void {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'jobtracker-frontend',
  });
}
