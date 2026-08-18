import 'server-only';

import type { AppError, AppResult } from '@/domain/errors';
import { err, ok, UNKNOWN_ERROR } from '@/domain/errors';

import { serverEnv } from '../config/env';
import { getAccessToken, resetAccessToken } from './token-provider';

/**
 * The single transport path to the API.
 *
 * Auth, timeouts, status handling and error translation live here once. Spread
 * across the callers they would be one chance each to omit the timeout — and the
 * one that omits it is the request that hangs a Server Component render until
 * the platform kills it.
 *
 * A free function rather than a base class: the repositories that use it need a
 * transport, not an ancestor, and inheriting one would make swapping it a change
 * to the type hierarchy instead of to an import.
 */
export async function apiRequest<TValue>(
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
