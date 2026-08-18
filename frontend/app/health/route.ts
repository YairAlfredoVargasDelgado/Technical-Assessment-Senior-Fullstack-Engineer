/**
 * Liveness endpoint for the container health check.
 *
 * ## Why not probe `/`
 *
 * The root redirects to `/jobs`, which is `force-dynamic` and calls the API. A
 * health check pointed there stops answering "is this process alive?" and starts
 * answering "is the whole stack alive?" — so a slow backend marks the *frontend*
 * unhealthy, Compose refuses to bring the stack up, and the report names the
 * wrong service. Liveness is about this process and nothing downstream.
 *
 * `force-dynamic` so the handler actually executes on each probe rather than the
 * build replaying a prerendered response, which would keep answering 200 from a
 * static file even in a runtime that could no longer render anything.
 */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return new Response('ok', {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
