# Design principles, as applied

Every example below points at a file in this repository. Where a principle is
enforced by a test rather than by convention, the test is named — the difference
between "we follow this" and "this cannot be broken without a red build".

---

## SOLID

### S — Single Responsibility

**`ValidationPipelineBehavior<TRequest, TResponse>`**
`backend/src/Common/JobTracker.Common.Application/Behaviors/ValidationPipelineBehavior.cs`

It has one reason to change: how validation failures become results. It does not
log, does not open transactions, does not know what a job is.

The reason it exists is the more interesting half. Without it, every handler
carries the same six lines — resolve validator, run it, check `IsValid`, build a
failure. Copied eleven times, the one handler that omits them is indistinguishable
from the ones that did not need them. Here it is written once and applies by
construction: adding a validator activates it, and the handler is never edited.

```csharp
// CreateJobCommandHandler in full. Note what is absent.
var address = Address.Create(...);
if (address.IsFailure) return Result.Failure<Guid>(address.Error);

var job = command is { ScheduledDateUtc: { } d, AssigneeId: { } a }
    ? Job.CreateScheduled(..., d, a, utcNow)
    : Job.CreateDraft(..., utcNow);

if (job.IsFailure) return Result.Failure<Guid>(job.Error);

await jobRepository.AddAsync(job.Value, cancellationToken);
await unitOfWork.SaveChangesAsync(cancellationToken);
```

No validation, no logging, no transaction management. Those are three other
responsibilities held by three other classes.

---

### O — Open/Closed

**Adding a reaction to job completion required no change to any existing file.**

`NotifyCustomerOnJobCompletedHandler`
(`backend/src/Modules/Billing/…/Invoices/EventHandlers/`) was added beside
`GenerateInvoiceOnJobCompletedHandler`. Neither the `Job` aggregate, nor
`CompleteJobCommandHandler`, nor the integration event, nor the outbox worker was
touched. MediatR discovers the new handler by its interface.

The counterfactual is what makes this concrete: with the invoice logic written
inside `CompleteJobCommandHandler`, adding the email means editing that handler —
and a mail-server outage then rolls back the invoice, because both live in one
transaction.

---

### L — Liskov Substitution

**`IEmailSender`** — `LoggingEmailSender` in development, a `SendGridEmailSender`
in production.

The contract promises exactly one thing: *accepted for delivery*. It does not
promise the message arrived, does not return a provider message id, and does not
throw on a bad address. Both implementations honour that, so no caller can tell
them apart — which is the actual test for substitutability, not "it implements the
interface".

The same holds for `IJobRepository`: `JobRepository` (EF Core) and the
hand-written fake in `CreateJobCommandHandlerTests` are interchangeable because
neither promises anything about *when* data is written — that is the Unit of
Work's business.

A violation would look like an implementation that throws where the interface
implies a return, or that requires a call ordering the contract does not state.

---

### I — Interface Segregation

**`IJobsUnitOfWork` and `IBillingUnitOfWork`**
`backend/src/Modules/*/…Application/Abstractions/`

Both extend `IUnitOfWork` and add nothing. That looks like ceremony until you see
what it prevents.

Both `DbContext`s implement `IUnitOfWork`. A handler asking the container for a
bare `IUnitOfWork` receives whichever module registered *last* — so a Jobs handler
could commit through Billing's context, find no tracked changes, and save nothing.
The command would report success and write nothing. Splitting the interface per
module turns that into a compile error.

`IJobRepository` is segregated in the ordinary sense too: three methods, no
`Update`, no `Delete`, no `IQueryable`. A caller cannot compose an arbitrary query
through it, which is what keeps the query plans in one place.

---

### D — Dependency Inversion

**`IDateTimeProvider`** is the clearest one, because the alternative is visibly
worse.

`Job.Schedule(scheduledDateUtc, assigneeId, utcNow)` takes the current instant as
a parameter. With `DateTime.UtcNow` inside the method, the test for "a job cannot
be scheduled in the past" has to pick a date far enough ahead to stay valid —
which makes it a test that passes today and fails in 2031.

```csharp
private static readonly DateTime Now = new(2030, 6, 1, 9, 0, 0, DateTimeKind.Utc);

[Fact]
public void Schedule_ExactlyNow_IsAccepted()
    => Draft().Schedule(Now, AssigneeId, Now).IsSuccess.Should().BeTrue();
```

That boundary test — "in the past" is rejected, "exactly now" is accepted — is not
writable at all without the inversion.

Structurally: `IJobRepository` is declared in `Jobs.Domain` and implemented in
`Jobs.Infrastructure`. The arrow points inward, and
`LayerDependencyTests.Domain_ShouldNotDependOnInfrastructure` fails the build if
it ever reverses.

---

## GRASP

### Information Expert

**`Job` decides whether it may be started**, because `Job` holds the status.

```csharp
private Result EnsureCanTransitionTo(JobStatus target)
    => AllowedTransitions[Status].Contains(target)
        ? Result.Success()
        : Result.Failure(JobErrors.InvalidTransition(Status, target));
```

Moving that decision into a handler or a `JobService` would mean exposing `Status`
publicly and then trusting every caller to consult it — which is how the same
check ends up written in four places and disagrees with itself in one.

### Creator

**`Job.AddPhoto` creates `JobPhoto`.** `JobPhoto.Create` is `internal`, and both
its constructors are `private`, so the `Job` aggregate in that assembly is the only
code in the world that can produce one. "Only accessible through the aggregate
root" is a compile error here, not a convention.

### Controller

**MediatR handlers** are the controllers. `CreateJobCommandHandler` gathers what
the domain needs (the tenant, the clock), calls the aggregate, and commits. It
decides nothing about validity — every rule it appears to enforce belongs to
`Address.Create` or to `Job`.

### Low Coupling

**Billing's entire knowledge of Jobs is one `using`:**

```csharp
using JobTracker.Modules.Jobs.IntegrationEvents;
```

`Job`, `JobStatus`, `Address` and `IJobRepository` are not on Billing's reference
graph at all. Verified by
`LayerDependencyTests.Billing_ShouldNotDependOnTheJobsDomain`.

### High Cohesion

**Vertical slices.** `Jobs/CompleteJob/` holds the command, its validator and its
handler — everything that changes when "completing a job" changes. The frontend
mirrors it: `features/complete-job/` holds the hook and the modal.

The alternative — `Commands/`, `Validators/`, `Handlers/` — spreads one use case
across three folders, so every change to it is a three-folder diff and nothing in
any folder is related to anything else in it.

---

## GoF patterns

| Pattern | Where | Problem solved |
|---|---|---|
| **Repository** | `IJobRepository` (domain) + `JobRepository` (infrastructure) | Abstracts persistence behind a collection-like facade over one aggregate root. Lets handlers be tested against a hand-written fake with no database and no `fetch` mocking. |
| **Unit of Work** | `IUnitOfWork` → `JobsDbContext` | Makes one business operation atomic. It is also where the outbox is written, which is what removes the dual-write problem. |
| **Observer** | `AggregateRoot.Raise` + MediatR `INotificationHandler`; `createTypedEventEmitter` on the client | The aggregate announces facts without knowing who listens. Adding a reaction needs no change to the publisher. |
| **Mediator** | MediatR | Decouples the transport from the use case. An endpoint holds a message, not a service reference, which is what lets cross-cutting concerns be applied by a pipeline. |
| **Decorator** | `LoggingPipelineBehavior`, `ValidationPipelineBehavior` | Adds behaviour around every handler without the handler participating. Open/Closed for cross-cutting concerns. |
| **Template Method** | `ValueObject.GetAtomicValues`; `ProcessOutboxMessagesJobBase.Schema` | The algorithm is written once (structural equality; claim-publish-mark) and each subtype supplies only what varies (its significant fields; its schema name). |
| **Builder** | `QueryBuilder<T>` (`frontend/src/shared/lib/query/`) | Constructs a query step by step while *narrowing the type at each step* — `.select()` restricts what `.where()` and `.orderBy()` will accept. Immutable, so a partly-built query is safe to share. |
| **State** | `Job.AllowedTransitions`; `JOB_TRANSITIONS` on the client | Legal moves as data rather than as a `switch`. On the client the one table has four consumers — the type system, the action buttons, the pre-flight guard and the optimistic target status — so adding a transition edits one place. |
| **Command** | `ICommand<TResponse>` + CQRS | A request is an object, which is what makes a uniform pipeline possible at all. |
| **Factory Method** | `Job.CreateDraft` / `Job.CreateScheduled`; `Address.Create`; `Money.Create` | Named construction that can *fail*. A constructor cannot return a `Result`, so an object that exists is an object that is valid. |
| **Strategy** | FluentValidation validators, resolved per request type | Validation rules vary independently of the pipeline that runs them. |
| **Adapter** | `InProcessEventBus`; `HttpJobRepository` | Translates between an abstraction the application owns and a concrete mechanism. Swapping in a RabbitMQ bus is one registration line. |

---

## DDD concepts

### Bounded context

Jobs and Billing are separate contexts with separate models and separate schemas.
The word *job* means different things in each: to Jobs it is a rich aggregate with
a lifecycle; to Billing it is a `Guid` on an invoice.

That difference is the point. Forcing one shared `Job` model on both would give
Billing fields it must ignore and would make every change to the Jobs lifecycle a
change Billing has to be regression-tested against.

The boundary is enforced by the reference graph, not by discipline —
`BillingDbContext` has no mapping for anything in the `jobs` schema, so a
cross-module join is not expressible.

### Open Host Service

`Jobs.IntegrationEvents` is the Jobs module's published language. It is the only
Jobs assembly another module may reference; it contains immutable records of
primitives and nothing else.

Its versioning rules are stated in the code and are real obligations: additive
optional properties are safe; renaming, removing or retightening one is a breaking
change for another team and requires a parallel `…V2` published alongside until
every consumer has migrated.

`LayerDependencyTests.IntegrationEvents_ShouldNotDependOnTheDomain` keeps the
contract publishable.

### Domain events vs integration events

|  | Domain event | Integration event |
|---|---|---|
| Audience | Inside one module | Across modules |
| May reference | Domain types | Primitives only |
| Lives in | `*.Domain` | `*.IntegrationEvents` |
| Dispatched | In-process, via the outbox | Via `IEventBus` |
| Compatibility | None promised | Versioned; changing it breaks other teams |
| Example | `JobCreatedDomainEvent` — notify the crew. No other context cares. | `JobCompletedIntegrationEvent` — Billing raises an invoice. |

`JobCreatedDomainEvent` deliberately stays a domain event. Promoting it "just in
case" would publish a contract nobody consumes and that could then never change.

### Eventual consistency

The job is completed the moment the transaction commits. The invoice exists
seconds later — bounded by the outbox polling interval.

What the outbox buys is that the second event is *inevitable*: the intent is
durable, the worker retries, and the only way to lose it is to lose the database.
What it costs is a window in which the two are out of step. That window is
acceptable here because an invoice raised ten seconds late is indistinguishable
from one raised immediately, and because the alternative — a distributed
transaction across modules — trades a bounded delay for a shared failure mode.

Delivery is **at-least-once**. Exactly-once delivery is not available; exactly-once
*effect* is, and it is bought with idempotency.

### Idempotency

Two layers, defending different failure modes — see
[`system-architecture.md` §3](./system-architecture.md#3-why-two-layers-of-idempotency).

The key is `JobId + CompletedAtUtc`, not `JobId` alone. A job that is completed,
re-opened by a correction, and completed again is genuinely two billable events;
keying on the identifier would silently drop the second.

The timestamp is rendered round-trip (`"O"`) so the key is byte-identical for the
same instant on any machine — a locale-formatted key would differ between servers
and defeat the whole mechanism.

---

## Where the same idea appears on both sides

The two runtimes cannot share code, but they can share *shape*. Where they do, it
is deliberate:

| Concept | Backend | Frontend |
|---|---|---|
| Failures are returned, not thrown | `Result<T>` / `Error` | `AppResult<T>` / `AppError` |
| Persistence behind an owned abstraction | `IJobRepository` | `JobRepositoryPort` |
| Composition root | `JobTrackerServiceExtensions` | `infrastructure/container.ts` |
| Legal moves as data | `Job.AllowedTransitions` | `JOB_TRANSITIONS` |
| Exhaustiveness | `switch` on a sealed set | `assertNever(state)` |

The state machine is the one genuine duplication in the system, and it is
unavoidable: two runtimes cannot share a table. What *is* avoided is duplication
*within* each side — on the client one `const` drives the types, the pre-flight
guard, the action buttons and the optimistic target status; on the server one
`FrozenDictionary` drives all five transition methods.

That last client consumer was added by the self-audit. The optimistic hook had
been writing `'InProgress'` as a literal, which was a second statement of "start
leads to InProgress" with nothing keeping it in step. See the README's self-audit
section.
