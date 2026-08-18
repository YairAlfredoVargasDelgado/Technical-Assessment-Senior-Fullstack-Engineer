/**
 * A fully type-safe event emitter with zero `any` and zero assertions.
 *
 * ## How `any` is avoided
 *
 * The usual implementation stores handlers in a `Map<string, Set<Function>>`
 * and casts on the way out, because the value type depends on the key. The fix
 * is to make the *storage itself* dependently typed:
 *
 * ```ts
 * type HandlerRegistry<E> = { [K in keyof E]?: Set<Handler<E[K]>> }
 * ```
 *
 * Indexing that mapped type with a generic `K extends keyof E` yields
 * `Set<Handler<E[K]>> | undefined` — already correlated to the key — so nothing
 * ever needs widening or narrowing back.
 *
 * ## GoF
 *
 * This is the Observer pattern. It is the client-side mirror of the domain
 * events raised by the `Job` aggregate on the backend: the same decoupling
 * idea, expressed in the language each side speaks.
 */

/**
 * Event name to payload mapping.
 *
 * Constrained to `object` rather than the more obvious `Record<string, unknown>`
 * on purpose: TypeScript gives `type` aliases an implicit index signature but
 * deliberately withholds one from `interface` declarations. A `Record`
 * constraint would therefore reject
 *
 * ```ts
 * interface JobEvents { 'job:created': JobCreatedPayload }
 * ```
 *
 * which is the most natural way to declare an event map. Widening the
 * constraint costs nothing: `keyof TEvents` and `TEvents[K]` stay exact.
 */
export type EventMap = object;

/** Handler for a single event's payload. */
export type EventHandler<TPayload> = (payload: TPayload) => void;

/** Returned by `on`; calling it detaches the handler. Designed for `useEffect` cleanup. */
export type Unsubscribe = () => void;

/**
 * Dependently-typed handler storage.
 *
 * A plain object rather than a `Map` precisely because a mapped type can express
 * the key/value correlation and `Map<K, V>` cannot.
 */
type HandlerRegistry<TEvents extends EventMap> = {
  [K in keyof TEvents]?: Set<EventHandler<TEvents[K]>>;
};

export interface TypedEventEmitter<TEvents extends EventMap> {
  /** Subscribes `handler` to `event`. Returns a function that detaches it. */
  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): Unsubscribe;

  /** Detaches a handler. Matching is by reference, so the same function must be passed. */
  off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void;

  /** Invokes every handler registered for `event` with `payload`. */
  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void;

  /** Number of handlers currently attached to `event`. */
  listenerCount<K extends keyof TEvents>(event: K): number;

  /** Detaches every handler for `event`, or for all events when omitted. */
  clear(event?: keyof TEvents): void;
}

export function createTypedEventEmitter<TEvents extends EventMap>(): TypedEventEmitter<TEvents> {
  // `let`, not `const`: clearing every event resets the whole registry in one
  // assignment. Iterating `Object.keys()` would hand back `string`, which is
  // not assignable to `keyof TEvents` and would force a cast — the exact thing
  // this implementation is built to avoid.
  let registry: HandlerRegistry<TEvents> = {};

  const handlersFor = <K extends keyof TEvents>(event: K): Set<EventHandler<TEvents[K]>> => {
    const existing = registry[event];
    if (existing !== undefined) {
      return existing;
    }

    const created = new Set<EventHandler<TEvents[K]>>();
    registry[event] = created;
    return created;
  };

  return {
    on(event, handler) {
      handlersFor(event).add(handler);
      return () => {
        this.off(event, handler);
      };
    },

    off(event, handler) {
      const handlers = registry[event];
      if (handlers === undefined) {
        return;
      }

      handlers.delete(handler);

      // Drop the empty bucket so `clear()` and memory profiles stay honest.
      if (handlers.size === 0) {
        delete registry[event];
      }
    },

    emit(event, payload) {
      const handlers = registry[event];
      if (handlers === undefined) {
        return;
      }

      // Snapshot before iterating: a handler is allowed to unsubscribe itself
      // (or another) during dispatch, and mutating a Set mid-iteration would
      // silently skip listeners.
      const snapshot = [...handlers];

      // One throwing handler must not stop the others from being notified —
      // that is a partial-notification bug that is very hard to trace. Failures
      // are collected and surfaced together instead of being swallowed.
      const failures: unknown[] = [];
      for (const handler of snapshot) {
        try {
          handler(payload);
        } catch (error: unknown) {
          failures.push(error);
        }
      }

      if (failures.length > 0) {
        throw new AggregateError(failures, `One or more handlers for "${String(event)}" threw.`);
      }
    },

    listenerCount(event) {
      return registry[event]?.size ?? 0;
    },

    clear(event) {
      if (event === undefined) {
        registry = {};
        return;
      }

      delete registry[event];
    },
  };
}
