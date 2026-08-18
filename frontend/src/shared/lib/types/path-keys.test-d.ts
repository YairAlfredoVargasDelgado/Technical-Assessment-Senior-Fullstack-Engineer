import { describe, expectTypeOf, it } from 'vitest';

import { getIn } from './path-keys.type';
import type { PathKeys, PathValue } from './path-keys.type';

interface Job {
  id: string;
  title: string;
  address: { street: string; geo: { lat: number; lng: number } };
  photos: string[];
  scheduledAt: Date;
  notes?: string;
}

describe('PathKeys', () => {
  it('matches the example from the specification', () => {
    expectTypeOf<PathKeys<{ a: { b: string; c: { d: number } } }>>().toEqualTypeOf<'a.b' | 'a.c.d'>();
  });

  it('emits leaf paths only — never the intermediate branch nodes', () => {
    type Paths = PathKeys<Job>;

    expectTypeOf<Paths>().toEqualTypeOf<
      | 'id'
      | 'title'
      | 'address.street'
      | 'address.geo.lat'
      | 'address.geo.lng'
      | 'photos'
      | 'scheduledAt'
      | 'notes'
    >();

    // 'address' and 'address.geo' are branches, so they must be absent.
    expectTypeOf<'address'>().not.toMatchTypeOf<Paths>();
    expectTypeOf<'address.geo'>().not.toMatchTypeOf<Paths>();
  });

  it('treats arrays, Date, Map and Set as leaves', () => {
    expectTypeOf<PathKeys<{ items: string[]; when: Date; index: Map<string, number> }>>().toEqualTypeOf<
      'items' | 'when' | 'index'
    >();
  });

  it('walks optional objects instead of misreading them as leaves', () => {
    expectTypeOf<PathKeys<{ maybe?: { deep: string } }>>().toEqualTypeOf<'maybe.deep'>();
  });

  it('terminates on self-referential types', () => {
    interface TreeNode {
      value: number;
      child?: TreeNode;
    }

    expectTypeOf<'value'>().toMatchTypeOf<PathKeys<TreeNode>>();
  });
});

describe('PathValue', () => {
  it('resolves the type at a nested path', () => {
    expectTypeOf<PathValue<Job, 'address.geo.lat'>>().toEqualTypeOf<number>();
    expectTypeOf<PathValue<Job, 'title'>>().toEqualTypeOf<string>();
    expectTypeOf<PathValue<Job, 'scheduledAt'>>().toEqualTypeOf<Date>();
  });
});

describe('getIn', () => {
  it('returns the precise type for a valid path', () => {
    const job = {} as Job;

    expectTypeOf(getIn(job, 'address.geo.lat')).toEqualTypeOf<number>();
    expectTypeOf(getIn(job, 'title')).toEqualTypeOf<string>();
  });

  it('rejects paths that do not exist', () => {
    const job = {} as Job;

    // @ts-expect-error 'address.geo.altitude' is not a path of Job
    getIn(job, 'address.geo.altitude');
    // @ts-expect-error 'address' is a branch, not a leaf
    getIn(job, 'address');
  });
});
