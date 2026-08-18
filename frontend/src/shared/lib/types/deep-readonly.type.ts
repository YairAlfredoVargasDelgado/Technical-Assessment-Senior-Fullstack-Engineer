import type {
  AnyArray,
  AnyMap,
  AnySet,
  BuiltIn,
  DefaultDepth,
  Depth,
  Prev,
  Primitive,
} from './type-primitives.type';

/**
 * Recursively marks every property of `T` as `readonly`.
 *
 * ## Why the branch order is load-bearing
 *
 * Every branch below except the first two matches `T extends object`. `Map`,
 * `Set`, arrays and `Date` are all objects, so the generic mapped-type branch
 * would swallow them if it came first — turning `Map<string, User>` into
 * `{ readonly get: ...; readonly set: ... }`. The order here is therefore
 * specific-to-general and must not be rearranged.
 *
 * ## Tuples
 *
 * Arrays and tuples share one branch. A homomorphic mapped type over an array
 * type preserves array-ness *and* tuple-ness, including element labels and
 * optional slots, so `[a: string, b?: number]` survives as
 * `readonly [a: string, b?: number]` rather than collapsing to
 * `readonly (string | number | undefined)[]`.
 *
 * @typeParam D - remaining recursion budget; see `Depth` in `type-primitives.type.ts`.
 */
export type DeepReadonly<T, D extends Depth = DefaultDepth> =
  // 0. Budget exhausted — stop rather than let the compiler blow the depth limit.
  [D] extends [0]
    ? T
    : // 1. Primitives are already immutable.
      T extends Primitive
      ? T
      : // 2. Functions and platform objects are atomic: pass through untouched.
        T extends BuiltIn
        ? T
        : // 3. Maps — per the specification the key type is preserved as-is and
          //    only the value is made deeply readonly.
          T extends ReadonlyMap<infer K, infer V>
          ? ReadonlyMap<K, DeepReadonly<V, Prev[D]>>
          : // 4. Sets.
            T extends ReadonlySet<infer V>
            ? ReadonlySet<DeepReadonly<V, Prev[D]>>
            : // 5. Arrays and tuples (homomorphic mapping preserves both shapes).
              T extends AnyArray
              ? { readonly [K in keyof T]: DeepReadonly<T[K], Prev[D]> }
              : // 6. Plain objects and class instances.
                T extends object
                ? { readonly [K in keyof T]: DeepReadonly<T[K], Prev[D]> }
                : // 7. `unknown` / `never` and anything else: leave alone.
                  T;

/**
 * Runtime counterpart: `Object.freeze` applied recursively.
 *
 * `DeepReadonly` is erased at runtime, so a compile-time guarantee alone does
 * not stop a mutation crossing a boundary the type system cannot see (a JSON
 * payload, a third-party callback). This function closes that gap and returns
 * the value re-typed, which is why the two live in the same module: the type
 * and its enforcement stay in sync.
 *
 * Cycles are handled with a `WeakSet`; freezing is idempotent, so re-entering
 * an already-visited object is simply skipped.
 */
export function deepFreeze<T>(value: T): DeepReadonly<T> {
  freezeInPlace(value, new WeakSet<object>());
  return value as DeepReadonly<T>;
}

function freezeInPlace(value: unknown, seen: WeakSet<object>): void {
  if (value === null || typeof value !== 'object') {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  // `Object.freeze` does not stop `Map#set` / `Set#add`, so their contents are
  // walked for consistency even though the collection itself stays mutable at
  // runtime. Callers get the compile-time guarantee; a truly immutable
  // collection would need a wrapper type, which is out of scope here.
  if (value instanceof Map) {
    for (const entry of value.values()) {
      freezeInPlace(entry, seen);
    }
  } else if (value instanceof Set) {
    for (const entry of value.values()) {
      freezeInPlace(entry, seen);
    }
  } else {
    for (const entry of Object.values(value)) {
      freezeInPlace(entry, seen);
    }
  }

  Object.freeze(value);
}

/** Convenience aliases used across the domain layer. */
export type ReadonlyDeepArray<T> = DeepReadonly<readonly T[]>;
export type ReadonlyDeepMap<K, V> = DeepReadonly<ReadonlyMap<K, V>>;
export type ReadonlyDeepSet<V> = DeepReadonly<ReadonlySet<V>>;

export type { AnyArray, AnyMap, AnySet };
