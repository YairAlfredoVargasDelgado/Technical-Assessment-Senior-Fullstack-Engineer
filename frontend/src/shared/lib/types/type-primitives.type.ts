/**
 * Type-level primitives shared by every recursive utility type in this folder.
 *
 * `DeepReadonly` and `PathKeys` both need to answer "is this a leaf?" and both
 * need a recursion budget. Defining those notions once here means the two types
 * can never disagree about what a leaf is — a class of bug that is invisible in
 * review when each utility carries its own private copy of the rules.
 */

/** Values that carry no structure to recurse into. */
export type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/**
 * Platform objects that are structurally objects but semantically atomic.
 *
 * These MUST be matched before the generic `object` branch: `Date` satisfies
 * `T extends object`, so without this bail-out `DeepReadonly<Date>` would be
 * mapped field-by-field into `{ readonly getTime: () => number, ... }` — a type
 * that is no longer assignable to `Date`.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- intentional: any callable shape is atomic here.
export type BuiltIn = Date | RegExp | Error | Promise<unknown> | Function;

/** Structural matchers used to detect collections regardless of mutability. */
export type AnyArray = readonly unknown[];
export type AnyMap = ReadonlyMap<unknown, unknown>;
export type AnySet = ReadonlySet<unknown>;

/** Anything that terminates recursion for path-walking purposes. */
export type Atomic = Primitive | BuiltIn | AnyArray | AnyMap | AnySet;

/**
 * Recursion budget.
 *
 * TypeScript aborts with "Type instantiation is excessively deep" on
 * self-referential types (`type Node = { child: Node }`). Threading an explicit
 * depth counter turns that hard compiler failure into a defined, documented
 * cut-off. `Prev[D]` decrements; reaching `0` stops the recursion.
 */
export type Depth = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type Prev = [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Default budget: deep enough for real domain models, shallow enough to stay fast. */
export type DefaultDepth = 8;

/**
 * Distributes over unions and reports whether `T` is atomic.
 *
 * Wrapping both sides in a tuple (`[T] extends [Atomic]`) suppresses the
 * distribution that a naked conditional would perform, so a union like
 * `string | { a: 1 }` is judged as a whole rather than member by member.
 */
export type IsAtomic<T> = [T] extends [Atomic] ? true : false;
