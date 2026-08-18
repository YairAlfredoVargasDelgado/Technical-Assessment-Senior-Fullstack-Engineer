/**
 * The data the E2E suite writes with.
 *
 * Extracted here because more than one spec needs it, and a second copy of
 * `uniqueTitle` would be two definitions of what "unique" means — the kind of
 * duplication that stays consistent right up until someone changes one of them.
 */

/**
 * Seeded identifiers. The API does not validate that a customer or crew member
 * exists — that would be another bounded context's business — so any well-formed
 * UUID is accepted, and fixed ones keep a failing run readable.
 */
export const CUSTOMER_ID = '33333333-3333-3333-3333-333333333333';
export const ASSIGNEE_ID = '44444444-4444-4444-4444-444444444444';

export const SIGNATURE_URL = 'https://cdn.example.com/signatures/e2e.png';

/**
 * A title unique to this run.
 *
 * The suite shares a database with previous runs, so a fixed title would match
 * rows left behind by an earlier execution and the assertions would pass — or
 * fail — for the wrong reason.
 */
export function uniqueTitle(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
}

/** `datetime-local` format, a few days out so the "not in the past" rule passes. */
export function scheduledSoon(): string {
  const when = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  return when.toISOString().slice(0, 16);
}
