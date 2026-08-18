import { describe, expectTypeOf, it } from 'vitest';

import type { DeepReadonly } from './deep-readonly.type';

/**
 * Compile-time tests. These run under `vitest --typecheck`, which invokes `tsc`
 * over this file; a failing assertion is a type error, not a runtime failure.
 */

interface Address {
  street: string;
  geo: { lat: number; lng: number };
}

interface Fixture {
  id: string;
  count: number;
  flag: boolean;
  address: Address;
  photos: { url: string; caption: string }[];
  pair: [label: string, weight?: number];
  index: Map<string, { revision: number }>;
  tags: Set<{ name: string }>;
  createdAt: Date;
  pattern: RegExp;
  format: (value: number) => string;
  optional?: { nested: string };
  nullable: string | null;
}

type Frozen = DeepReadonly<Fixture>;

describe('DeepReadonly', () => {
  it('leaves primitives untouched', () => {
    expectTypeOf<Frozen['id']>().toEqualTypeOf<string>();
    expectTypeOf<Frozen['count']>().toEqualTypeOf<number>();
    expectTypeOf<Frozen['flag']>().toEqualTypeOf<boolean>();
    expectTypeOf<Frozen['nullable']>().toEqualTypeOf<string | null>();
  });

  it('recurses into nested objects', () => {
    expectTypeOf<Frozen['address']>().toEqualTypeOf<{
      readonly street: string;
      readonly geo: { readonly lat: number; readonly lng: number };
    }>();
  });

  it('turns arrays into ReadonlyArray of deeply readonly items', () => {
    expectTypeOf<Frozen['photos']>().toEqualTypeOf<
      readonly { readonly url: string; readonly caption: string }[]
    >();
  });

  it('preserves tuple shape, element labels and optional slots', () => {
    expectTypeOf<Frozen['pair']>().toEqualTypeOf<readonly [label: string, weight?: number]>();
  });

  it('turns Map into ReadonlyMap with a deeply readonly value', () => {
    expectTypeOf<Frozen['index']>().toEqualTypeOf<ReadonlyMap<string, { readonly revision: number }>>();
  });

  it('turns Set into ReadonlySet with a deeply readonly element', () => {
    expectTypeOf<Frozen['tags']>().toEqualTypeOf<ReadonlySet<{ readonly name: string }>>();
  });

  it('treats platform objects as atomic rather than mapping their methods', () => {
    expectTypeOf<Frozen['createdAt']>().toEqualTypeOf<Date>();
    expectTypeOf<Frozen['pattern']>().toEqualTypeOf<RegExp>();
  });

  it('passes functions through unchanged', () => {
    expectTypeOf<Frozen['format']>().toEqualTypeOf<(value: number) => string>();
  });

  it('keeps optionality while making the value readonly', () => {
    expectTypeOf<Frozen['optional']>().toEqualTypeOf<{ readonly nested: string } | undefined>();
  });

  it('terminates on self-referential types instead of exceeding the depth limit', () => {
    interface TreeNode {
      value: number;
      child?: TreeNode;
    }

    // The assertion that matters is that this file compiles at all: an unbounded
    // recursive conditional type raises TS2589 here.
    expectTypeOf<DeepReadonly<TreeNode>['value']>().toEqualTypeOf<number>();
  });

  it('rejects mutation of every level', () => {
    const frozen = {} as Frozen;

    // @ts-expect-error top-level property is readonly
    frozen.id = 'x';
    // @ts-expect-error nested property is readonly
    frozen.address.street = 'x';
    // @ts-expect-error deeply nested property is readonly
    frozen.address.geo.lat = 1;
    // @ts-expect-error arrays lose their mutating methods
    frozen.photos.push({ url: 'a', caption: 'b' });
    // @ts-expect-error ReadonlyMap has no `set`
    frozen.index.set('k', { revision: 1 });
    // @ts-expect-error ReadonlySet has no `add`
    frozen.tags.add({ name: 'n' });
  });
});
