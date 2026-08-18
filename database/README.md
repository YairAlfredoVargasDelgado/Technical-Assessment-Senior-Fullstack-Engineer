# Database

PostgreSQL 16. One database, one schema per module.

| Path | What it is |
|---|---|
| `schema/001-jobs-schema.sql` | Idempotent DDL for the `jobs` schema, generated from EF Core migrations |
| `schema/002-billing-schema.sql` | Idempotent DDL for the `billing` schema |
| `queries/search-jobs.sql` | The job search query, its indexing strategy, and measured `EXPLAIN` results |

The schema files are **generated**, not hand-written (`dotnet ef migrations script --idempotent`).
A hand-maintained copy alongside the migrations would be a second definition of the
same schema with nothing keeping the two in step — and the one that drifts is
always the one you are reading when something breaks. Regenerate with:

```bash
cd backend
dotnet ef migrations script --idempotent \
  --project src/Modules/Jobs/JobTracker.Modules.Jobs.Infrastructure \
  --startup-project src/JobTracker.Api --context JobsDbContext \
  --output ../database/schema/001-jobs-schema.sql
```

---

## Schema isolation

Each module owns a schema and migrates it independently, with its own
`__EFMigrationsHistory` table inside that schema. `BillingDbContext` has no mapping
for anything in `jobs`, so a cross-module join is not merely discouraged — it is
not expressible. That is the property that stops a modular monolith decaying into
a shared database with modules painted on top.

| Schema | Owner | Tables |
|---|---|---|
| `jobs` | Jobs module | `jobs`, `job_photos`, `outbox_messages`, `outbox_message_consumers` |
| `billing` | Billing module | `invoices`, `outbox_messages`, `outbox_message_consumers` |
| `hangfire` | Infrastructure | Hangfire's own job storage |

---

## Normalization decisions

**Normalized.** `job_photos` is a separate table because the relationship is
one-to-many and unbounded; an array column would make "count photos per job"
un-indexable and photo-level updates a read-modify-write of the whole array.

**Denormalized on purpose.** `Address` is stored as six columns on `jobs`
(`address_street`, `address_city`, …) rather than an `addresses` table. It is a
value object: it has no identity, is never queried independently, and is only ever
read as part of the job that owns it. A separate table would add a join to every
read to model a relationship the domain does not have.

**Derived and stored.** Two generated columns exist purely so particular query
plans are possible — `search_vector` (a GIN index cannot be built on a per-query
expression) and `sort_key` (a keyset pagination key cannot be nullable, and a
parameterised `COALESCE` in the `WHERE` clause cannot match an expression index).
Both are `GENERATED ALWAYS ... STORED`, so they cannot drift from the columns they
derive from — the database maintains them, not application code.

---

## Denormalization vs integration events

> Section 4.3 of the assessment: when to copy `customer_name` into `jobs` rather
> than joining from the Contacts module, and when to sync with integration events
> instead.

**The join is not available.** This is the first thing to say, because it changes
the question. `Contacts` is a different bounded context in a different schema, and
`JobsDbContext` has no mapping for its tables. So the real choice is not
"denormalize or join" — it is **"denormalize, or make a call at read time"**. In a
distributed deployment that call is a network hop; in this monolith it is a second
query through the Contacts module's public API. Either way it is not a join, and a
job list of 50 rows becomes 51 round trips unless it is batched.

**Denormalize when the read pattern demands it.** The job list renders a customer
name on every row and is the most-hit endpoint in the product. Copying
`customer_name` onto `jobs` makes that render a single index scan. The cost is that
the copy is a cache, and caches go stale: when a customer is renamed, every job
row carrying the old name is wrong until something updates it.

**Integration events are how the copy is kept honest.** Contacts publishes
`CustomerRenamedIntegrationEvent`; Jobs consumes it and updates its copies. This is
the same mechanism `JobCompletedIntegrationEvent` already uses to reach Billing, so
it costs no new infrastructure. The guarantee it provides is **eventual
consistency**: the copy is stale for as long as the outbox takes to drain —
seconds, bounded by the polling interval — and then correct. Delivery is
at-least-once, so the update handler must be idempotent; setting a name to a value
is naturally so.

**Choosing between them.**

| | Join / cross-module call | Denormalized copy + events |
|---|---|---|
| Consistency | Strong — always current | Eventual — stale for one outbox cycle |
| Read cost | N+1, or a batched round trip | One index scan |
| Write cost | None | An event per change, plus a handler |
| Failure mode | Contacts is down → the list will not render | Contacts is down → the list renders slightly stale data |
| Coupling | Runtime, on availability | Design-time, on a published contract |

The deciding question is not performance, it is **what the data is for**. A
customer's name on a job list is a label: showing yesterday's name for thirty
seconds is a cosmetic defect. Denormalize it.

A customer's *credit limit*, checked before accepting work, is a decision input:
acting on a stale value means accepting a job that should have been refused, and
the failure is financial rather than cosmetic. Read that one live, and accept the
coupling — or model the decision as something the owning context performs and
returns, which is the version that scales.

The last row of the table is the one that decides it in practice. The denormalized
design degrades — stale labels — where the live-read design fails outright, and
degrading beats failing for anything that is not a correctness input.
