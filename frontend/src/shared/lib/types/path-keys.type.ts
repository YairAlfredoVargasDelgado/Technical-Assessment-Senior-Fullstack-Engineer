import type { Atomic, DefaultDepth, Depth, Prev } from './type-primitives.type';

/**
 * Union of dot-notation paths to the **leaf** properties of `T`.
 *
 * ```ts
 * PathKeys<{ a: { b: string; c: { d: number } } }>
 * // => "a.b" | "a.c.d"
 * ```
 *
 * Intermediate paths (`"a"`, `"a.c"`) are deliberately absent: the contract is
 * "paths to leaves", and emitting branch nodes too would let a caller write
 * `get(job, 'address')` and receive an object where the signature promises a
 * scalar.
 *
 * ## Design notes
 *
 * - `-?` strips optionality from the mapped key so `{ notes?: string }` yields
 *   `"notes"` rather than `"notes" | undefined`.
 * - `NonNullable` unwraps `T[K]` before the leaf test, so an optional nested
 *   object is still walked instead of being misclassified as atomic.
 * - Arrays, `Map`, `Set`, `Date` and functions are leaves. Indexing into a
 *   collection is a runtime concern (the index is not known statically), so
 *   inventing `"photos.0.url"` would promise safety the type cannot deliver.
 * - The recursion budget makes self-referential models terminate instead of
 *   triggering "Type instantiation is excessively deep and possibly infinite".
 */
export type PathKeys<T, D extends Depth = DefaultDepth> = [D] extends [0]
  ? never
  : T extends Atomic
    ? never
    : T extends object
      ? {
          [K in Extract<keyof T, string>]-?: NonNullable<T[K]> extends Atomic
            ? K
            : PathKeys<NonNullable<T[K]>, Prev[D]> extends infer Sub extends string
              ? `${K}.${Sub}`
              : never;
        }[Extract<keyof T, string>]
      : never;

/**
 * Resolves the type sitting at a given dot-notation path.
 *
 * This is the inverse of `PathKeys` and the reason `PathKeys` is worth having:
 * together they make `getIn(obj, path)` fully typed with no overloads and no
 * casts at the call site.
 */
export type PathValue<T, P extends string> = P extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? PathValue<NonNullable<T[Head]>, Rest>
    : never
  : P extends keyof T
    ? T[P]
    : never;

/**
 * Reads a nested value by dot-notation path.
 *
 * The signature — not a cast — is what makes this safe: `P` is constrained to
 * `PathKeys<T>`, so an invalid path is a compile error, and the return type is
 * computed by `PathValue` rather than widened to `unknown`.
 *
 * The single internal `as` is confined to the loop accumulator, which is
 * genuinely untypeable while walking an arbitrary path; it never leaks into the
 * public signature.
 */
export function getIn<T extends object, P extends PathKeys<T> & string>(
  source: T,
  path: P,
): PathValue<T, P> {
  const segments = path.split('.');

  let current: unknown = source;
  for (const segment of segments) {
    if (current === null || current === undefined) {
      break;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current as PathValue<T, P>;
}
