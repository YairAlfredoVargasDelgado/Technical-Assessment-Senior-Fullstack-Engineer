import { describe, expect, it } from 'vitest';

import { deepFreeze } from './deep-readonly.type';

describe('deepFreeze', () => {
  it('freezes nested objects, not just the root', () => {
    const value = deepFreeze({ id: 'a', nested: { deeper: { flag: true } } });

    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.nested)).toBe(true);
    expect(Object.isFrozen(value.nested.deeper)).toBe(true);
  });

  it('freezes objects held inside arrays', () => {
    const value = deepFreeze({ items: [{ name: 'one' }, { name: 'two' }] });

    expect(Object.isFrozen(value.items)).toBe(true);
    expect(Object.isFrozen(value.items[0])).toBe(true);
  });

  it('walks Map and Set entries', () => {
    const entry = { revision: 1 };
    const member = { name: 'tag' };

    deepFreeze({ index: new Map([['k', entry]]), tags: new Set([member]) });

    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(member)).toBe(true);
  });

  it('terminates on cyclic graphs instead of recursing forever', () => {
    interface Node {
      name: string;
      self?: Node;
    }

    const node: Node = { name: 'root' };
    node.self = node;

    expect(() => deepFreeze(node)).not.toThrow();
    expect(Object.isFrozen(node)).toBe(true);
  });

  it('ignores primitives and null', () => {
    expect(deepFreeze(null)).toBeNull();
    expect(deepFreeze(42)).toBe(42);
    expect(deepFreeze('text')).toBe('text');
  });

  it('rejects mutation at runtime in strict mode', () => {
    const value = deepFreeze({ nested: { flag: true } });

    expect(() => {
      // The cast is the point of the test: it simulates untyped code reaching
      // past the compile-time guarantee.
      (value.nested as { flag: boolean }).flag = false;
    }).toThrow(TypeError);
  });
});
