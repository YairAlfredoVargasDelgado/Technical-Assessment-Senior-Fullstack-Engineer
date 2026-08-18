/**
 * A chainable, type-narrowing SQL query builder (GoF **Builder**).
 *
 * ```ts
 * const { query, params } = new QueryBuilder<Job>()
 *   .from('jobs')
 *   .select('id', 'title', 'status')
 *   .where('status', 'eq', 'completed')
 *   .orderBy('title', 'asc')
 *   .limit(10)
 *   .build();
 *
 * // query is typed — not merely `string` — as:
 * // "SELECT id, title, status FROM jobs WHERE status = ($1) ORDER BY title ASC LIMIT 10"
 * ```
 *
 * ## The two design decisions that make this work
 *
 * **1. The builder is immutable.** Every method returns a *new* `QueryBuilder`
 * whose type arguments have grown. Mutating `this` and returning it could never
 * narrow the type, because an object's type is fixed at construction. This is
 * also why a shared builder cannot be corrupted by a second consumer.
 *
 * **2. The runtime state is deliberately NOT generic.** `QueryState` holds
 * plain `readonly string[]` / `readonly unknown[]`. Because the state carries no
 * type parameters, handing it to a differently-parameterised `QueryBuilder`
 * needs no cast — the type-level and value-level tracks run in parallel and only
 * meet once, in `build()`.
 */

/**
 * Operator name to SQL symbol.
 *
 * Declared as a value and the type derived from it with `typeof`, never the
 * other way round. A hand-written twin type would be a second place to edit,
 * and the compiler cannot tell you when the two drift apart.
 */
const SQL_SYMBOL = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  in: '= ANY',
} as const;

/** Every supported operator, derived from the single source above. */
export type ComparisonOperator = keyof typeof SQL_SYMBOL;

type SqlSymbolOf<TOperator extends ComparisonOperator> = (typeof SQL_SYMBOL)[TOperator];

export type SortDirection = 'asc' | 'desc';

/** Field types on which ordering comparisons are meaningful. */
type Comparable = number | bigint | string | Date;

/**
 * The operators that are legal for a given field type.
 *
 * `.where('isArchived', 'gt', true)` is nonsense, and this is what makes it a
 * compile error rather than a runtime surprise: `gt` is simply not in the union
 * when the field is a boolean.
 */
export type OperatorsFor<TValue> =
  | 'eq'
  | 'neq'
  | 'in'
  | (NonNullable<TValue> extends string ? 'like' : never)
  | (NonNullable<TValue> extends Comparable ? 'gt' | 'gte' | 'lt' | 'lte' : never);

/**
 * The value type the third argument of `.where()` must have.
 *
 * `in` takes a list; every other operator takes a single value of the field's
 * own type. Postgres receives the list as ONE parameter via `= ANY($n)`, which
 * keeps placeholder numbering independent of list length.
 */
export type OperandFor<TValue, TOperator extends ComparisonOperator> = TOperator extends 'in'
  ? readonly TValue[]
  : TValue;

/* -------------------------------------------------------------------------- */
/* Type-level string assembly                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Joins a tuple of string literals with a separator.
 *
 * The final branch matters: a non-tuple `string[]` carries no statically known
 * elements, so the honest result is `string` rather than a fabricated literal.
 */
export type Join<TParts extends readonly string[], TSeparator extends string> = TParts extends readonly []
  ? ''
  : TParts extends readonly [infer Only extends string]
    ? Only
    : TParts extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
      ? `${Head}${TSeparator}${Join<Tail, TSeparator>}`
      : string;

/** Next 1-based placeholder index, computed from how many params exist so far. */
type NextPlaceholder<TParams extends readonly unknown[]> = `$${[...TParams, unknown]['length'] & number}`;

/**
 * A single WHERE predicate.
 *
 * Every operator renders through the same `field symbol (placeholder)` shape.
 * The parentheses are what let `= ANY` share the template with `=` and `LIKE`
 * instead of needing a special case in both the type and the runtime — two
 * places that could disagree.
 */
type Predicate<
  TField extends string,
  TOperator extends ComparisonOperator,
  TParams extends readonly unknown[],
> = `${TField} ${SqlSymbolOf<TOperator>} (${NextPlaceholder<TParams>})`;

type Ordering<TField extends string, TDirection extends SortDirection> =
  `${TField} ${Uppercase<TDirection>}`;

type SelectClause<TSelected extends readonly string[]> = TSelected extends readonly []
  ? '*'
  : Join<TSelected, ', '>;

type WhereClause<TPredicates extends readonly string[]> = TPredicates extends readonly []
  ? ''
  : ` WHERE ${Join<TPredicates, ' AND '>}`;

type OrderByClause<TOrderings extends readonly string[]> = TOrderings extends readonly []
  ? ''
  : ` ORDER BY ${Join<TOrderings, ', '>}`;

type LimitClause<TLimit extends number | null> = TLimit extends null ? '' : ` LIMIT ${TLimit & number}`;

/** The fully assembled query string type. */
export type CompiledQuery<
  TTable extends string,
  TSelected extends readonly string[],
  TPredicates extends readonly string[],
  TOrderings extends readonly string[],
  TLimit extends number | null,
> = `SELECT ${SelectClause<TSelected>} FROM ${TTable}${WhereClause<TPredicates>}${OrderByClause<TOrderings>}${LimitClause<TLimit>}`;

/**
 * Fields callable code may reference.
 *
 * Before any `.select()` the query is `SELECT *`, so every field is available.
 * After a `.select()` the surface narrows to exactly what was selected — which
 * is what makes `.orderBy('title')` a compile error when `title` was not
 * selected.
 */
type AvailableFields<
  TEntity extends object,
  TSelected extends readonly string[],
> = TSelected extends readonly [] ? Extract<keyof TEntity, string> : TSelected[number];

/* -------------------------------------------------------------------------- */
/* Runtime state                                                              */
/* -------------------------------------------------------------------------- */

/** Non-generic on purpose — see the class docblock. */
export interface QueryState {
  readonly table: string;
  readonly fields: readonly string[];
  readonly predicates: readonly string[];
  readonly orderings: readonly string[];
  readonly params: readonly unknown[];
  readonly limit: number | null;
}

const EMPTY_STATE: QueryState = Object.freeze({
  table: 'entity',
  fields: Object.freeze([]),
  predicates: Object.freeze([]),
  orderings: Object.freeze([]),
  params: Object.freeze([]),
  limit: null,
});

export interface BuiltQuery<TQuery extends string> {
  readonly query: TQuery;
  readonly params: unknown[];
}

/* -------------------------------------------------------------------------- */
/* Builder                                                                    */
/* -------------------------------------------------------------------------- */

export class QueryBuilder<
  TEntity extends object,
  TTable extends string = string,
  TSelected extends readonly Extract<keyof TEntity, string>[] = readonly [],
  TPredicates extends readonly string[] = readonly [],
  TOrderings extends readonly string[] = readonly [],
  TParams extends readonly unknown[] = readonly [],
  TLimit extends number | null = null,
> {
  /**
   * The state parameter exists so that chained methods can hand their successor
   * an already-built state. TypeScript has no `friend`/`internal` visibility, so
   * a private constructor would also block the documented `new QueryBuilder<Job>()`
   * entry point. Callers pass nothing; the default is the empty query.
   */
  public constructor(private readonly state: QueryState = EMPTY_STATE) {}

  /**
   * Sets the table.
   *
   * A method rather than a constructor argument because TypeScript has no
   * partial type-argument inference: `new QueryBuilder<Job>('jobs')` would
   * leave the table type as `string`, whereas `.from('jobs')` infers the
   * literal `'jobs'` and carries it into the compiled query type.
   */
  public from<TNextTable extends string>(
    table: TNextTable,
  ): QueryBuilder<TEntity, TNextTable, TSelected, TPredicates, TOrderings, TParams, TLimit> {
    return new QueryBuilder({ ...this.state, table });
  }

  /**
   * Chooses the projected columns and narrows what `.where()` and `.orderBy()`
   * will accept from this point on.
   */
  public select<const TFields extends readonly Extract<keyof TEntity, string>[]>(
    ...fields: TFields
  ): QueryBuilder<TEntity, TTable, TFields, TPredicates, TOrderings, TParams, TLimit> {
    return new QueryBuilder({ ...this.state, fields });
  }

  /**
   * Appends a WHERE predicate.
   *
   * Three separate guarantees, all at compile time:
   * - `field` must be one of the currently available fields;
   * - `operator` must be legal for that field's type (no `gt` on a boolean);
   * - `value` must match the field's type, or be a list of it for `in`.
   */
  public where<
    TField extends AvailableFields<TEntity, TSelected>,
    TOperator extends OperatorsFor<TEntity[TField & keyof TEntity]>,
  >(
    field: TField,
    operator: TOperator,
    value: OperandFor<TEntity[TField & keyof TEntity], TOperator>,
  ): QueryBuilder<
    TEntity,
    TTable,
    TSelected,
    readonly [...TPredicates, Predicate<TField, TOperator, TParams>],
    TOrderings,
    readonly [...TParams, OperandFor<TEntity[TField & keyof TEntity], TOperator>],
    TLimit
  > {
    const placeholder = `$${this.state.params.length + 1}`;
    const predicate = `${field} ${SQL_SYMBOL[operator]} (${placeholder})`;

    return new QueryBuilder({
      ...this.state,
      predicates: [...this.state.predicates, predicate],
      params: [...this.state.params, value],
    });
  }

  /** Appends an ORDER BY term. The field must be present in the projection. */
  public orderBy<TField extends AvailableFields<TEntity, TSelected>, TDirection extends SortDirection>(
    field: TField,
    direction: TDirection,
  ): QueryBuilder<
    TEntity,
    TTable,
    TSelected,
    TPredicates,
    readonly [...TOrderings, Ordering<TField, TDirection>],
    TParams,
    TLimit
  > {
    const ordering = `${field} ${direction.toUpperCase()}`;

    return new QueryBuilder({
      ...this.state,
      orderings: [...this.state.orderings, ordering],
    });
  }

  /**
   * Caps the row count.
   *
   * Inlined as a literal rather than parameterised so it can appear in the
   * compiled query *type*. It is a `number` from a closed generic, never
   * user-supplied text, so there is no injection surface.
   */
  public limit<TNextLimit extends number>(
    value: TNextLimit,
  ): QueryBuilder<TEntity, TTable, TSelected, TPredicates, TOrderings, TParams, TNextLimit> {
    return new QueryBuilder({ ...this.state, limit: value });
  }

  /**
   * Compiles to a parameterised SQL string plus its ordered parameter list.
   *
   * ### The one assertion in this file, and why it is sound
   *
   * The template below and the `CompiledQuery` type are two renderings of the
   * same grammar — one evaluated at runtime, one by the type checker. Assembling
   * a string from `Array#join` necessarily produces `string`; TypeScript cannot
   * prove that the result matches the literal type it computed independently.
   * The assertion is therefore confined to this single expression, is a direct
   * `as` (never `as unknown as`, never `any`), and its soundness rests on one
   * invariant: **every clause is appended to `state` and to the type arguments
   * by the same method, in the same order.** `query-builder.test.ts` pins that
   * invariant by asserting the emitted string equals its own compiled type.
   */
  public build(): BuiltQuery<CompiledQuery<TTable, TSelected, TPredicates, TOrderings, TLimit>> {
    const { table, fields, predicates, orderings, params, limit } = this.state;

    const projection = fields.length === 0 ? '*' : fields.join(', ');
    const where = predicates.length === 0 ? '' : ` WHERE ${predicates.join(' AND ')}`;
    const order = orderings.length === 0 ? '' : ` ORDER BY ${orderings.join(', ')}`;
    const take = limit === null ? '' : ` LIMIT ${limit}`;

    const query = `SELECT ${projection} FROM ${table}${where}${order}${take}`;

    return {
      query: query as CompiledQuery<TTable, TSelected, TPredicates, TOrderings, TLimit>,
      params: [...params],
    };
  }
}
