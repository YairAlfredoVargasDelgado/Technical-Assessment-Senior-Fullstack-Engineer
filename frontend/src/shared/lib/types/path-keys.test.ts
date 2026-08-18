import { describe, expect, it } from 'vitest';

import { getIn } from './path-keys.type';

const job = {
  id: 'job-1',
  title: 'Roof repair',
  address: { street: '12 Elm St', geo: { lat: 40.7, lng: -74 } },
  photos: ['before.jpg'],
};

describe('getIn', () => {
  it('reads a top-level property', () => {
    expect(getIn(job, 'title')).toBe('Roof repair');
  });

  it('reads a deeply nested property', () => {
    expect(getIn(job, 'address.geo.lat')).toBe(40.7);
  });

  it('returns arrays as leaves rather than indexing into them', () => {
    expect(getIn(job, 'photos')).toEqual(['before.jpg']);
  });

  it('stops at the first nullish segment instead of throwing', () => {
    const partial = { a: { b: null } } as unknown as { a: { b: { c: string } } };

    expect(getIn(partial, 'a.b.c')).toBeNull();
  });
});
