import { describe, expect, it } from 'vitest';

import { QueryBuilder } from './query-builder';

interface Job {
  id: string;
  title: string;
  status: 'draft' | 'scheduled' | 'completed';
  scheduledDate: Date;
  photoCount: number;
  isArchived: boolean;
}

describe('QueryBuilder — runtime behaviour', () => {
  /**
   * These assertions are what make the single `as` inside `build()` sound.
   *
   * `built.query` is statically typed as the literal on the right-hand side, so
   * `toBe` compares the string the runtime actually produced against the string
   * the type checker independently computed. If the two renderings of the
   * grammar ever diverge, this fails — which is the whole safety argument for
   * that assertion.
   */
  it('emits exactly the string its compiled type promises', () => {
    const built = new QueryBuilder<Job>()
      .from('jobs')
      .select('id', 'title', 'status')
      .where('status', 'eq', 'completed')
      .orderBy('title', 'asc')
      .limit(10)
      .build();

    expect(built.query).toBe(
      'SELECT id, title, status FROM jobs WHERE status = ($1) ORDER BY title ASC LIMIT 10',
    );
    expect(built.params).toEqual(['completed']);
  });

  it('numbers placeholders in the order predicates were added', () => {
    const built = new QueryBuilder<Job>()
      .from('jobs')
      .select('id', 'photoCount')
      .where('photoCount', 'gte', 2)
      .where('id', 'in', ['a', 'b'])
      .build();

    expect(built.query).toBe(
      'SELECT id, photoCount FROM jobs WHERE photoCount >= ($1) AND id = ANY ($2)',
    );
    expect(built.params).toEqual([2, ['a', 'b']]);
  });

  it('projects every column when nothing is selected', () => {
    const built = new QueryBuilder<Job>().from('jobs').where('isArchived', 'eq', false).build();

    expect(built.query).toBe('SELECT * FROM jobs WHERE isArchived = ($1)');
    expect(built.params).toEqual([false]);
  });

  it('renders multiple orderings in insertion order', () => {
    const built = new QueryBuilder<Job>()
      .from('jobs')
      .select('title', 'photoCount')
      .orderBy('photoCount', 'desc')
      .orderBy('title', 'asc')
      .build();

    expect(built.query).toBe('SELECT title, photoCount FROM jobs ORDER BY photoCount DESC, title ASC');
  });

  it('passes a list as a single parameter so numbering stays independent of its length', () => {
    const built = new QueryBuilder<Job>()
      .from('jobs')
      .select('status')
      .where('status', 'in', ['draft', 'scheduled'])
      .where('status', 'neq', 'completed')
      .build();

    expect(built.query).toBe('SELECT status FROM jobs WHERE status = ANY ($1) AND status <> ($2)');
    expect(built.params).toHaveLength(2);
  });

  /**
   * Immutability is not a stylistic preference here: it is what allows a partly
   * built query to be shared as a base. A mutating builder would let the second
   * branch observe the first branch's predicate.
   */
  it('never mutates the builder it was derived from', () => {
    const base = new QueryBuilder<Job>().from('jobs').select('id', 'status');

    const draftOnly = base.where('status', 'eq', 'draft').build();
    const completedOnly = base.where('status', 'eq', 'completed').build();

    expect(draftOnly.query).toBe('SELECT id, status FROM jobs WHERE status = ($1)');
    expect(draftOnly.params).toEqual(['draft']);

    expect(completedOnly.query).toBe('SELECT id, status FROM jobs WHERE status = ($1)');
    expect(completedOnly.params).toEqual(['completed']);

    expect(base.build().query).toBe('SELECT id, status FROM jobs');
  });

  it('returns a fresh params array so callers cannot corrupt the builder', () => {
    const builder = new QueryBuilder<Job>().from('jobs').select('id').where('id', 'eq', 'a');

    const first = builder.build();
    first.params.push('injected');

    expect(builder.build().params).toEqual(['a']);
  });

  it('defaults the table when from() is not called', () => {
    expect(new QueryBuilder<Job>().select('id').build().query).toBe('SELECT id FROM entity');
  });
});
