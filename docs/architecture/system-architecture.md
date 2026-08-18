# System architecture

Every box below corresponds to a directory in this repository. Where a claim in
this document is enforced by a test rather than a convention, the test is named.

---

## 1. The whole system

```
                                    ┌──────────────┐
                                    │   Browser    │
                                    └──────┬───────┘
                                           │ HTTPS
┌──────────────────────────────────────────▼───────────────────────────────────────────┐
│ FRONTEND — Next.js 15 App Router                                    :3000            │
│                                                                                      │
│  app/jobs/page.tsx  ── 'server-only'  ── SERVER COMPONENT                            │
│      │  creates the promise, does NOT await it                                       │
│      │                                                                               │
│      ├── <Suspense fallback={<JobsTableSkeleton/>}>  ← shell streams immediately      │
│      │        └── <JobsLoader promise>  ── awaits HERE, so the boundary suspends     │
│      │                    │                                                          │
│      │                    ▼  props (the server owns the list)                        │
│      └────────── ═══ 'use client' BOUNDARY ═══                                       │
│                           │                                                          │
│                  JobsClient  (thin shell — one hook call, then JSX)                  │
│                           │                                                          │
│                  useJobsPage  ──── orchestrates, the only file that sees all slices  │
│                    ├── create-job    (useReducer form)                               │
│                    ├── filter-jobs   (compound component)                            │
│                    └── complete-job  (optimistic + rollback)                         │
│                           │                                                          │
│                  useJobsStore (Zustand) ── UI state + OPTIMISTIC OVERLAY only        │
│                           │                    (never a copy of the job list)        │
│                  useVisibleJobs = useMemo(merge → filter → sort)                      │
│                                                                                      │
│  app/jobs/actions.ts  ── 'use server'  ── MUTATIONS ONLY, returns AppResult          │
│                                                                                      │
│  ── Clean Architecture beneath the routes ──────────────────────────────────────     │
│     src/presentation → src/application → src/domain                                  │
│                              ▲                                                       │
│     src/infrastructure ──────┘  (HttpJobRepository implements JobRepositoryPort)      │
│     src/infrastructure/container.ts  ── composition root, 'server-only'               │
└───────────────────────────────────┬──────────────────────────────────────────────────┘
                                    │ REST + Bearer JWT
┌───────────────────────────────────▼──────────────────────────────────────────────────┐
│ BACKEND — .NET 9 modular monolith                                    :8080           │
│                                                                                      │
│  CROSS-CUTTING (JobTracker.Api — the composition root)                               │
│  ┌────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Serilog → CORS → JwtBearer → Authorization → SlidingWindow rate limit          │  │
│  │ OpenTelemetry (ASP.NET + HttpClient + EF Core + Npgsql) ──► OTLP               │  │
│  │ HttpTenantContext: org_id claim ─► ITenantContext ─► EF global query filter    │  │
│  └────────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│  PRESENTATION   Jobs.Presentation — IEndpoint, discovered not listed                 │
│        │        Result ──► RFC 9457 ProblemDetails (one mapping, every endpoint)     │
│        ▼                                                                             │
│  APPLICATION    Jobs.Application — MediatR                                           │
│        │        pipeline:  LoggingBehavior → ValidationBehavior → Handler            │
│        │        Commands / Queries, all returning Result<T>                          │
│        ▼                                                                             │
│  DOMAIN         Jobs.Domain — Job (AR) · JobPhoto (entity) · Address (VO)            │
│        ▲        invariants + FrozenDictionary transition table + domain events       │
│        │        IJobRepository declared HERE                                         │
│  INFRASTRUCTURE Jobs.Infrastructure — EF Core, JobRepository (partial: Reads/Writes) │
│                 InsertOutboxMessagesInterceptor, JobsDbContext                       │
│                                                                                      │
│  ┌── Jobs.IntegrationEvents ── OPEN HOST SERVICE ─────────────────────────────────┐  │
│  │   The ONLY assembly another module may reference. Primitives only.            │  │
│  │   Enforced by LayerDependencyTests.Billing_ShouldNotDependOnTheJobsDomain     │  │
│  └───────────────────────────────┬────────────────────────────────────────────────┘  │
│                                  │                                                   │
│  BILLING MODULE  ────────────────┘  Invoice (AR) · Money (VO) · idempotency key      │
└───────────────────────────────────┬──────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼──────────────────────────────────────────────────┐
│ POSTGRESQL 16 — one database, one schema per module                   :5432          │
│                                                                                      │
│   schema "jobs"          │  schema "billing"         │  schema "hangfire"            │
│   ─────────────────────  │  ───────────────────────  │  ──────────────────           │
│   jobs                   │  invoices                 │  job / state / server         │
│     search_vector  GIN   │    UNIQUE(idempotency_key)│                               │
│     sort_key       BTREE │  outbox_messages          │                               │
│   job_photos             │  outbox_message_consumers │                               │
│   outbox_messages        │  __EFMigrationsHistory    │                               │
│   outbox_message_consumers                                                           │
│   __EFMigrationsHistory  │                                                           │
│                                                                                      │
│   BillingDbContext has no mapping for anything in "jobs" — a cross-module join is    │
│   not discouraged, it is not expressible.                                            │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. The asynchronous pipeline

This is the part the assessment cares most about, and the part that is easiest to
get subtly wrong. The numbered steps below were each observed running.

```
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │ ① ONE TRANSACTION                                                            │
  │                                                                              │
  │   CompleteJobCommandHandler                                                  │
  │        │                                                                     │
  │        ├─► job.Complete(signatureUrl, utcNow)                                │
  │        │       ├─ transition table says InProgress → Completed is legal      │
  │        │       ├─ Status = Completed                                         │
  │        │       └─ Raise(JobCompletedDomainEvent)   ← buffered, not dispatched│
  │        │                                                                     │
  │        └─► unitOfWork.SaveChangesAsync()                                     │
  │                │                                                             │
  │                ├─ InsertOutboxMessagesInterceptor.SavingChangesAsync         │
  │                │     harvests the buffered events → INSERT outbox_messages   │
  │                │                                                             │
  │                └─ BEGIN … UPDATE jobs … INSERT outbox_messages … COMMIT      │
  │                                                                              │
  │   Both rows commit or neither does. There is no window in which the job is   │
  │   completed but the invoice request was lost — the dual-write problem, gone. │
  └──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │  (the HTTP request has already returned 204)
                                      ▼
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │ ② HANGFIRE, every N seconds                                                  │
  │                                                                              │
  │   ProcessJobsOutboxMessagesJob : ProcessOutboxMessagesJobBase                │
  │        │                                                                     │
  │        ├─ SELECT … WHERE processed_on_utc IS NULL                            │
  │        │  ORDER BY occurred_on_utc LIMIT @batch                              │
  │        │  FOR UPDATE SKIP LOCKED     ← several workers, no blocking          │
  │        │                                                                     │
  │        ├─ for each message:                                                  │
  │        │    ├─ already in outbox_message_consumers? → SKIP  (idempotency ①)  │
  │        │    ├─ MediatR.Publish(domainEvent)                                  │
  │        │    ├─ INSERT outbox_message_consumers                               │
  │        │    └─ UPDATE processed_on_utc  (+ error, if it threw)               │
  │        │                                                                     │
  │        └─ one poison message is isolated; the other 19 still process         │
  └──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │ ③ IN-MODULE HANDLER — the boundary                                           │
  │                                                                              │
  │   JobCompletedDomainEventHandler                                             │
  │        └─► IEventBus.PublishAsync(JobCompletedIntegrationEvent)              │
  │                                                                              │
  │   Left of this line: a Jobs-internal type, free to change.                   │
  │   Right of it: a published contract other teams depend on.                   │
  └──────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
  ┌───────────────────────────────┐   ┌────────────────────────────────────────┐
  │ ④a BILLING                    │   │ ④b NOTIFICATION                        │
  │                               │   │                                        │
  │ GenerateInvoiceOn…Handler     │   │ NotifyCustomerOn…Handler               │
  │   key = JobId + CompletedAt   │   │   IEmailSender.SendAsync(...)          │
  │   exists? → skip              │   │                                        │
  │   INSERT invoices             │   │ Separate handler on purpose: a mail    │
  │     UNIQUE(idempotency_key)   │   │ outage must not roll back the invoice, │
  │        ← idempotency ②        │   │ and a pricing failure must not         │
  │                               │   │ suppress the customer's confirmation.  │
  └───────────────────────────────┘   └────────────────────────────────────────┘
```

**Verified.** Replaying the outbox row (`UPDATE outbox_messages SET
processed_on_utc = NULL`) produced no second invoice, and the log recorded
`Outbox message … was already consumed by JobCompletedDomainEvent; skipping.`

---

## 3. Why two layers of idempotency

They are not redundant. They defend different failure modes, and each survives
the other's absence.

| | `outbox_message_consumers` | `UNIQUE(invoices.idempotency_key)` |
|---|---|---|
| Scope | One *message*, one handler | One *business fact* |
| Catches | Worker crashed after handling, before marking processed | Manual replay, backfill, a second event for the same completion, a concurrent double-delivery |
| Where | Shared kernel, every module | The Billing aggregate |
| Mechanism | Composite primary key | Unique index |
| Survives the outbox table being truncated | No | Yes |

The handler's `ExistsWithIdempotencyKeyAsync` check is only a fast path — it and
the insert are not atomic, so two concurrent deliveries can both pass it. The
unique index is what actually holds.

---

## 4. Multi-tenancy

One mechanism, applied in one place, so it cannot be forgotten.

```
  JWT  ──►  org_id claim  ──►  HttpTenantContext : ITenantContext
                                        │
                    ┌───────────────────┴────────────────────┐
                    ▼                                        ▼
     JobsDbContext.HasQueryFilter(job =>          Job.CreateDraft(..., organizationId)
       !tenant.IsResolved ||                        ← taken from the claim, never
       job.OrganizationId == tenant.OrganizationId)   from the request body
```

`IsResolved` exists because Hangfire workers run outside any request and
therefore outside any tenant; without it the filter would evaluate a throwing
property and the outbox worker could never read a row.

**Verified.** A token for organisation B returned `items: 0` for a job created
under organisation A.

---

## 5. Where each rule lives

The single most important table in this document: every rule has exactly one
home, and no rule appears twice.

| Rule | Enforced in | Never in |
|---|---|---|
| Title is non-empty, ≤ 200 chars | `Job.ValidateCore` | The validator repeats only the *length*, from the aggregate's own constant |
| Request shape (required fields, UUID format) | `CreateJobCommandValidator` | The aggregate |
| A job cannot be scheduled in the past | `Job.Schedule` | The validator. The form checks it too, against the *browser's* clock, purely for immediate feedback |
| Which transitions are legal | `Job.AllowedTransitions` (one `FrozenDictionary`) | The five methods that consult it |
| Which actions the UI offers | `JOB_TRANSITIONS` (one `const`, TS) | The table component, which has no status check at all |
| The status an optimistic update paints | `nextStatusFor`, reading the same table | The hook, which no longer writes `'InProgress'` as a literal |
| Tenant scoping | EF global query filter | Individual queries |
| HTTP status for a failure | `ResultExtensions` via `ErrorType` | Individual endpoints |
| snake_case column naming | `UseSnakeCaseNames()` convention | `HasColumnName` per property |
| Enum-as-string | `ConfigureConventions` | `HasConversion` per property |
