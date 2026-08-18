/**
 * The failure shape the whole application speaks.
 *
 * The API returns RFC 9457 ProblemDetails. Letting that shape reach the UI would
 * put a transport concern in every component and make the UI break when the API's
 * error envelope changes. The infrastructure layer translates once, into this.
 */
export interface AppError {
  /** Stable, machine-readable. Branch on this, never on `message`. */
  readonly code: string;
  readonly message: string;
  /** Per-field messages, when the failure was a validation failure. */
  readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
}

/**
 * The outcome of an operation that can fail.
 *
 * The same reasoning as the backend's `Result<T>`: a rejected business rule is an
 * ordinary outcome the caller must handle, and a discriminated union puts that
 * obligation in the type rather than in a `try`/`catch` a caller can forget.
 *
 * It also matters at the Server Action boundary specifically: an exception thrown
 * in a Server Action reaches the client as a redacted, generic message in
 * production, so a thrown validation error becomes unusable to the form that
 * needs to display it. A returned value survives serialisation intact.
 */
export type AppResult<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: AppError };

export const ok = <TValue>(value: TValue): AppResult<TValue> => ({ ok: true, value });

export const err = <TValue = never>(error: AppError): AppResult<TValue> => ({ ok: false, error });

export const UNKNOWN_ERROR: AppError = {
  code: 'Unknown',
  message: 'Something went wrong. Please try again.',
};
