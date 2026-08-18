import { describe, expectTypeOf, it } from 'vitest';

import { QueryBuilder } from './query-builder';

interface Job {
  id: string;
  title: string;
  status: 'draft' | 'scheduled' | 'completed';
  scheduledDate: Date;
  photoCount: number;
  isArchived: boolean;
}

describe('QueryBuilder — type-level behaviour', () => {
  it('compiles the specification example into a precise template literal type', () => {
    const built = new QueryBuilder<Job>()
      .from('jobs')
      .select('id', 'title', 'status')
      .where('status', 'eq', 'completed')
      .orderBy('title', 'asc')
      .limit(10)
      .build();

    expectTypeOf(built.query).toEqualTypeOf<'SELECT id, title, status FROM jobs WHERE status = ($1) ORDER BY title ASC LIMIT 10'>();
    expectTypeOf(built.params).toEqualTypeOf<unknown[]>();
  });

  it('still satisfies the contract stated in the brief: { query: string; params: unknown[] }', () => {
    const built = new QueryBuilder<Job>().from('jobs').select('id').build();

    expectTypeOf(built).toMatchTypeOf<{ query: string; params: unknown[] }>();
  });

  it('advances placeholder numbering across predicates', () => {
    const built = new QueryBuilder<Job>()
      .from('jobs')
      .select('id', 'photoCount')
      .where('photoCount', 'gte', 2)
      .where('id', 'in', ['a', 'b'])
      .build();

    expectTypeOf(built.query).toEqualTypeOf<'SELECT id, photoCount FROM jobs WHERE photoCount >= ($1) AND id = ANY ($2)'>();
  });

  it('projects SELECT * and exposes every field when nothing is selected', () => {
    const built = new QueryBuilder<Job>().from('jobs').where('isArchived', 'eq', false).build();

    expectTypeOf(built.query).toEqualTypeOf<'SELECT * FROM jobs WHERE isArchived = ($1)'>();
  });

  it('accumulates multiple orderings in order', () => {
    const built = new QueryBuilder<Job>()
      .from('jobs')
      .select('title', 'photoCount')
      .orderBy('photoCount', 'desc')
      .orderBy('title', 'asc')
      .build();

    expectTypeOf(built.query).toEqualTypeOf<'SELECT title, photoCount FROM jobs ORDER BY photoCount DESC, title ASC'>();
  });

  it('narrows the field surface after select()', () => {
    // @ts-expect-error 'scheduledDate' was not selected, so orderBy must reject it
    new QueryBuilder<Job>().from('jobs').select('id', 'title').orderBy('scheduledDate', 'asc');

    // @ts-expect-error where() is narrowed by select() too
    new QueryBuilder<Job>().from('jobs').select('id').where('title', 'eq', 'x');
  });

  it('rejects unknown fields', () => {
    // @ts-expect-error 'nope' is not a key of Job
    new QueryBuilder<Job>().from('jobs').select('nope');
  });

  it('validates the operand against the field type', () => {
    // @ts-expect-error title is a string, not a number
    new QueryBuilder<Job>().from('jobs').select('title').where('title', 'eq', 42);

    // @ts-expect-error 'bogus' is not a member of the status union
    new QueryBuilder<Job>().from('jobs').select('status').where('status', 'eq', 'bogus');

    // @ts-expect-error 'in' takes a list, not a single value
    new QueryBuilder<Job>().from('jobs').select('status').where('status', 'in', 'draft');
  });

  it('validates the operator against the field type', () => {
    // @ts-expect-error ordering comparisons are meaningless on a boolean
    new QueryBuilder<Job>().from('jobs').select('isArchived').where('isArchived', 'gt', true);

    // @ts-expect-error LIKE only applies to string fields
    new QueryBuilder<Job>().from('jobs').select('photoCount').where('photoCount', 'like', '5');
  });
});
