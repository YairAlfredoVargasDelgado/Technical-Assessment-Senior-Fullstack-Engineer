import 'server-only';

import type { Job, JobPage } from '@/domain/entities/job/job.entity';
import type { AppError, AppResult } from '@/domain/errors';
import { err, ok, UNKNOWN_ERROR } from '@/domain/errors';
import type {
  CancelJobInput,
  CompleteJobInput,
  CreateJobInput,
  JobRepositoryPort,
  JobSearchQuery,
} from '@/application/ports/job-repository.port';

import { serverEnv } from '../config/env';
import { getAccessToken, resetAccessToken } from './token-provider';

/**
 * Talks to the JobTracker API over HTTP.
 *
 * ## The only class that knows the API exists
 *
 * Above it, use cases depend on `JobRepositoryPort`. Below it, nothing. Route
 * shapes, header names, the ProblemDetails envelope and the API's field naming
 * all stop here — which is what makes an API change a one-file change rather than
 * a search across the presentation layer.
 *
 * ## Errors are returned, never thrown
 *
 * Every method returns `AppResult`. A 409 from a rejected state transition is an
 * ordinary outcome the UI must render, not an exception; and because these calls
 * are made from Server Actions, a thrown error would reach the browser as a
 * redacted generic message in production and the form would have nothing to show.
 */
export class HttpJobRepository implements JobRepositoryPort {
  public async search(query: JobSearchQuery = {}, signal?: AbortSignal): Promise<AppResult<JobPage>> {
    const params = new URLSearchParams();
    const { filters, cursor, limit } = query;

    if (filters?.searchTerm) {
      params.set('searchTerm', filters.searchTerm);
    }

    // Repeated key rather than a comma-joined list: ASP.NET Core binds
    // `?status=A&status=B` to an array natively, and a joined string would need
    // a custom binder on the other side.
    for (const status of filters?.statuses ?? []) {
      params.append('status', status);
    }

    if (filters?.scheduledFrom) {
      params.set('scheduledFrom', filters.scheduledFrom);
    }

    if (filters?.scheduledTo) {
      params.set('scheduledTo', filters.scheduledTo);
    }

    if (filters?.assigneeId) {
      params.set('assigneeId', filters.assigneeId);
    }

    if (cursor) {
      params.set('cursor', cursor);
    }

    if (limit !== undefined) {
      params.set('limit', String(limit));
    }

    const search = params.size > 0 ? `?${params.toString()}` : '';

    return this.request<JobPage>(`/api/jobs${search}`, { method: 'GET' }, signal);
  }

  public async getById(jobId: string, signal?: AbortSignal): Promise<AppResult<Job>> {
    return this.request<Job>(`/api/jobs/${encodeURIComponent(jobId)}`, { method: 'GET' }, signal);
  }

  public async create(input: CreateJobInput): Promise<AppResult<string>> {
    // The API takes the address flat while the application layer keeps it
    // composed. Flattening here — and only here — is what stops the wire format
    // dictating the shape of types above this class.
    const { address, ...rest } = input;

    return this.request<string>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        ...rest,
        street: address.street,
        city: address.city,
        state: address.state,
        zipCode: address.zipCode,
        latitude: address.latitude,
        longitude: address.longitude,
      }),
    });
  }

  public async start(jobId: string): Promise<AppResult<void>> {
    return this.request<void>(`/api/jobs/${encodeURIComponent(jobId)}/start`, { method: 'POST' });
  }

  public async complete({ jobId, signatureUrl }: CompleteJobInput): Promise<AppResult<void>> {
    return this.request<void>(`/api/jobs/${encodeURIComponent(jobId)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ signatureUrl }),
    });
  }

  public async cancel({ jobId, reason }: CancelJobInput): Promise<AppResult<void>> {
    return this.request<void>(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  /**
   * The single transport path.
   *
   * Auth, timeouts, status handling and error translation live here once. Spread
   * across five methods they would be five chances to omit the timeout — and the
   * one that omits it is the request that hangs a Server Component render until
   * the platform kills it.
   */
  private async request<TValue>(
    path: string,
    init: RequestInit,
    externalSignal?: AbortSignal,
  ): Promise<AppResult<TValue>> {
    const env = serverEnv();

    // Two reasons to abort: our own timeout, and the caller's cancellation (a
    // Server Component render that was discarded). `AbortSignal.any` joins them
    // so neither is lost.
    const timeout = AbortSignal.timeout(env.API_TIMEOUT_MS);
    const signal = externalSignal ? AbortSignal.any([timeout, externalSignal]) : timeout;

    let response: Response;

    try {
      response = await fetch(`${env.API_BASE_URL}${path}`, {
        ...init,
        signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getAccessToken()}`,
          ...init.headers,
        },
        // Job data is per-tenant and changes on every mutation. Next.js caches
        // fetches by default, which would serve one organisation's list to
        // another and show stale rows after a write.
        cache: 'no-store',
      });
    } catch (error: unknown) {
      return err(toNetworkError(error));
    }

    if (response.status === 401) {
      // The cached token was rejected. Dropping it means the next attempt mints a
      // fresh one instead of looping on a stale credential.
      resetAccessToken();
      return err({ code: 'Unauthorized', message: 'The session has expired. Please reload the page.' });
    }

    if (!response.ok) {
      return err(await toProblemDetailsError(response));
    }

    // 204 has no body; parsing it would throw on an empty string.
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return ok(undefined as TValue);
    }

    try {
      return ok((await response.json()) as TValue);
    } catch {
      return err({ code: 'MalformedResponse', message: 'The API returned a response that could not be read.' });
    }
  }
}

function toNetworkError(error: unknown): AppError {
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return { code: 'Timeout', message: 'The request took too long. Please try again.' };
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return { code: 'Aborted', message: 'The request was cancelled.' };
  }

  return {
    code: 'NetworkError',
    message: 'Could not reach the server. Check your connection and try again.',
  };
}

/**
 * Translates an RFC 9457 ProblemDetails payload into an `AppError`.
 *
 * The `code` extension is preferred over the HTTP status because it is specific:
 * `Job.InvalidTransition` tells the UI which message to show, where `409` only
 * says that something conflicted.
 */
async function toProblemDetailsError(response: Response): Promise<AppError> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    return { ...UNKNOWN_ERROR, code: `Http.${response.status}` };
  }

  if (typeof payload !== 'object' || payload === null) {
    return { ...UNKNOWN_ERROR, code: `Http.${response.status}` };
  }

  const problem = payload as {
    code?: unknown;
    detail?: unknown;
    title?: unknown;
    errors?: unknown;
  };

  const code = typeof problem.code === 'string' ? problem.code : `Http.${response.status}`;
  const message = typeof problem.detail === 'string'
    ? problem.detail
    : typeof problem.title === 'string'
      ? problem.title
      : UNKNOWN_ERROR.message;

  const fieldErrors = parseFieldErrors(problem.errors);

  return fieldErrors === undefined ? { code, message } : { code, message, fieldErrors };
}

function parseFieldErrors(value: unknown): Record<string, readonly string[]> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const entries = Object.entries(value).flatMap(([field, messages]) =>
    Array.isArray(messages) && messages.every((item): item is string => typeof item === 'string')
      ? [[field, messages] as const]
      : [],
  );

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export type { Job };
