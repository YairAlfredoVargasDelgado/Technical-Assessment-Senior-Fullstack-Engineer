import 'server-only';

import { serverEnv } from '../config/env';

/**
 * Supplies the bearer token for server-side API calls.
 *
 * ## What this is, honestly
 *
 * A development stand-in. It calls the API's `/api/dev/token` endpoint — which is
 * registered only outside Production — and caches the result until shortly before
 * it expires.
 *
 * In production this is the one class that changes: it reads the access token from
 * the user's session (a `httpOnly` cookie set by an OAuth callback, or an IdP SDK)
 * instead of minting one. Nothing above it changes, because everything above it
 * depends on `getAccessToken()` and not on where the token came from.
 *
 * ## Why a stand-in rather than no authentication
 *
 * Disabling auth for the demo would mean the E2E suite exercises a code path that
 * never ships. This way every request the UI makes carries a real signed token
 * through the real validation middleware — the tenant filter, the claims, the 401
 * on expiry are all genuinely exercised.
 */
interface CachedToken {
  readonly accessToken: string;
  readonly expiresAtMs: number;
}

let cached: CachedToken | null = null;

/** Refresh this far before expiry so a request never races the boundary. */
const REFRESH_MARGIN_MS = 60_000;

export async function getAccessToken(): Promise<string> {
  const now = Date.now();

  if (cached !== null && cached.expiresAtMs - REFRESH_MARGIN_MS > now) {
    return cached.accessToken;
  }

  const env = serverEnv();

  const response = await fetch(`${env.API_BASE_URL}/api/dev/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organizationId: env.DEV_ORGANIZATION_ID,
      userId: env.DEV_USER_ID,
    }),
    // Never cached: a token is per-session state, and Next.js would otherwise
    // serve one process's token to another request.
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(
      `Could not obtain an access token (HTTP ${response.status}). `
      + 'Is the API running and is the development token endpoint enabled?',
    );
  }

  const payload: unknown = await response.json();

  if (
    typeof payload !== 'object'
    || payload === null
    || !('accessToken' in payload)
    || typeof payload.accessToken !== 'string'
  ) {
    throw new Error('The token endpoint returned an unexpected payload.');
  }

  // The API issues 60-minute tokens; the margin above keeps this conservative.
  cached = { accessToken: payload.accessToken, expiresAtMs: now + 55 * 60_000 };

  return cached.accessToken;
}

/** Clears the cache. Used by tests, and after a 401 forces a re-issue. */
export function resetAccessToken(): void {
  cached = null;
}
