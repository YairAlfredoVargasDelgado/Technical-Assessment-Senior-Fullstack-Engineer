/** Public API of the type-level utility library. */
export type {
  AnyArray,
  AnyMap,
  AnySet,
  Atomic,
  BuiltIn,
  DefaultDepth,
  Depth,
  IsAtomic,
  Prev,
  Primitive,
} from './type-primitives.type';

export type { DeepReadonly, ReadonlyDeepArray, ReadonlyDeepMap, ReadonlyDeepSet } from './deep-readonly.type';
export { deepFreeze } from './deep-readonly.type';

export type { PathKeys, PathValue } from './path-keys.type';
export { getIn } from './path-keys.type';
