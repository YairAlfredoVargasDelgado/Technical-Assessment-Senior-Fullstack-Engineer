import { describe, expect, it, vi } from 'vitest';

import { createTypedEventEmitter } from './typed-event-emitter';

interface JobEvents {
  'job:created': { id: string; title: string };
  'job:completed': { id: string; completedAt: Date };
  'job:selection-changed': readonly string[];
}

describe('createTypedEventEmitter', () => {
  it('delivers the payload to every subscribed handler', () => {
    const emitter = createTypedEventEmitter<JobEvents>();
    const first = vi.fn();
    const second = vi.fn();

    emitter.on('job:created', first);
    emitter.on('job:created', second);
    emitter.emit('job:created', { id: 'j1', title: 'Roof repair' });

    expect(first).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledWith({ id: 'j1', title: 'Roof repair' });
    expect(second).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledWith({ id: 'j1', title: 'Roof repair' });
  });

  it('does not leak events across event names', () => {
    const emitter = createTypedEventEmitter<JobEvents>();
    const onCompleted = vi.fn();

    emitter.on('job:completed', onCompleted);
    emitter.emit('job:created', { id: 'j1', title: 't' });

    expect(onCompleted).not.toHaveBeenCalled();
  });

  it('removes a handler by reference via off()', () => {
    const emitter = createTypedEventEmitter<JobEvents>();
    const handler = vi.fn();

    emitter.on('job:created', handler);
    emitter.off('job:created', handler);
    emitter.emit('job:created', { id: 'j1', title: 't' });

    expect(handler).not.toHaveBeenCalled();
    expect(emitter.listenerCount('job:created')).toBe(0);
  });

  it('ignores off() for a handler that was never registered', () => {
    const emitter = createTypedEventEmitter<JobEvents>();

    expect(() => {
      emitter.off('job:created', vi.fn());
    }).not.toThrow();
  });

  it('returns an unsubscribe function from on()', () => {
    const emitter = createTypedEventEmitter<JobEvents>();
    const handler = vi.fn();

    const unsubscribe = emitter.on('job:created', handler);
    unsubscribe();
    emitter.emit('job:created', { id: 'j1', title: 't' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('deduplicates the same handler reference', () => {
    const emitter = createTypedEventEmitter<JobEvents>();
    const handler = vi.fn();

    emitter.on('job:created', handler);
    emitter.on('job:created', handler);

    expect(emitter.listenerCount('job:created')).toBe(1);
  });

  /**
   * A handler that unsubscribes during dispatch is the classic way to corrupt a
   * naive `for (const h of set)` loop: the Set shrinks mid-iteration and a later
   * listener is silently skipped.
   */
  it('notifies every listener even when one unsubscribes during dispatch', () => {
    const emitter = createTypedEventEmitter<JobEvents>();
    const second = vi.fn();

    const first = vi.fn(() => {
      emitter.off('job:created', first);
    });

    emitter.on('job:created', first);
    emitter.on('job:created', second);
    emitter.emit('job:created', { id: 'j1', title: 't' });

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('runs the remaining handlers when one throws, then reports the failures together', () => {
    const emitter = createTypedEventEmitter<JobEvents>();
    const boom = new Error('handler exploded');
    const survivor = vi.fn();

    emitter.on('job:created', () => {
      throw boom;
    });
    emitter.on('job:created', survivor);

    expect(() => {
      emitter.emit('job:created', { id: 'j1', title: 't' });
    }).toThrow(AggregateError);

    expect(survivor).toHaveBeenCalledOnce();
  });

  it('is a no-op when emitting an event with no listeners', () => {
    const emitter = createTypedEventEmitter<JobEvents>();

    expect(() => {
      emitter.emit('job:completed', { id: 'j1', completedAt: new Date() });
    }).not.toThrow();
  });

  it('clears one event or all events', () => {
    const emitter = createTypedEventEmitter<JobEvents>();

    emitter.on('job:created', vi.fn());
    emitter.on('job:completed', vi.fn());

    emitter.clear('job:created');
    expect(emitter.listenerCount('job:created')).toBe(0);
    expect(emitter.listenerCount('job:completed')).toBe(1);

    emitter.clear();
    expect(emitter.listenerCount('job:completed')).toBe(0);
  });
});
