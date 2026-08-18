/**
 * Exhaustiveness guard.
 *
 * Placed in the `default` branch of a `switch` over a discriminated union, this
 * turns "someone added a union member and forgot a case" from a silent runtime
 * fall-through into a compile error: the un-handled member is still assignable
 * at that point, so it will not satisfy the `never` parameter.
 *
 * It also throws, because the compile-time guarantee evaporates the moment data
 * arrives from outside the type system — a JSON payload, `localStorage`, a
 * hand-written test fixture.
 */
export function assertNever(value: never, context = 'value'): never {
  throw new Error(`Unhandled ${context}: ${JSON.stringify(value)}`);
}
