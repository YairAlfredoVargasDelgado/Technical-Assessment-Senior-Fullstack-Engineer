# JobTracker

A multi-tenant job management system for a roofing company.
**Next.js 15 (App Router) + .NET 9 modular monolith + PostgreSQL 16.**

---

## Running it

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API (Scalar reference) | http://localhost:8080/scalar/v1 |
| Hangfire dashboard | http://localhost:8080/hangfire |
| Jaeger (distributed traces) | http://localhost:16686 |
| PostgreSQL | `localhost:5432` — `jobtracker` / `jobtracker` |

The backend applies both modules' EF Core migrations on start-up in Development.
Nothing else to configure — no `.env`, no seed step, no sign-in.

Open http://localhost:3000. **The database starts empty, so the first thing on
screen is the empty state rather than a table** — press *New job* to create one.
The customer and assignee fields are dropdowns filled from `/api/directory/*`.

Completing a job generates an invoice a few seconds later, through the outbox and
Hangfire rather than in the request. That path is the one worth watching: the
Hangfire dashboard shows the worker, and Jaeger shows one trace spanning the
browser, the Next.js server and the API.

<details>
<summary>Running each part directly</summary>

```bash
# PostgreSQL only
docker compose up -d postgres

# Backend  → http://localhost:5106  (the port launchSettings.json serves on)
cd backend && dotnet run --project src/JobTracker.Api

# Frontend → http://localhost:3000
cd frontend && npm ci && npm run dev
```
</details>

### Tests

```bash
cd backend  && dotnet test                    # 103 tests — domain, handlers, architecture
cd frontend && npm test                       # 183 runtime tests
cd frontend && npm run test:coverage          # 93.3% lines / 96.5% branches
cd frontend && npm run test:e2e               # 11 Playwright specs, incl. accessibility
```

---

## Reading the code

Start with these three, in order. They carry the decisions the rest follows from.

| File | Why |
|---|---|
| `backend/src/Modules/Jobs/…Domain/Jobs/Job.cs` | The aggregate. Invariants as a transition table, domain events raised from inside the operation that earns them. |
| `frontend/src/presentation/stores/jobs.store.ts` | Why the store holds an optimistic *overlay* and not a copy of the job list. |
| `docs/architecture/system-architecture.md` | Diagram, the async pipeline step by step, and a table of where every rule lives. |

Full documentation:

- [`docs/architecture/system-architecture.md`](docs/architecture/system-architecture.md) — diagrams, async pipeline, multi-tenancy
- [`docs/architecture/design-principles.md`](docs/architecture/design-principles.md) — SOLID, GRASP, GoF, DDD, with real examples
- [`database/README.md`](database/README.md) — schema, normalization analysis, denormalization vs integration events
- [`database/queries/search-jobs.sql`](database/queries/search-jobs.sql) — the search query, indexing strategy, measured `EXPLAIN` output

---

## Architectural decisions

### Three contradictions in the brief, and how they are resolved

The specification asks for a few pairs of things that cannot both be true. Each is
resolved deliberately rather than silently.

**1. "The store manages `jobs[]`" vs "must NOT duplicate server state."**

A `jobs[]` array in the store *is* a copy of server state, with every problem a
copy brings: it goes stale when another user changes a row, it must be re-synced
after every mutation, and "which of these two lists is right?" becomes a question
the codebase keeps having to answer.

The store keeps the **intent** and drops the **copy**. It holds filters, sort,
selection, and an overlay of optimistic patches — changes requested but not yet
confirmed. The list itself is fetched by the Server Component and passed as props;
`useVisibleJobs` merges the two during render.

The payoff is rollback: because the store never mutated a row, undoing a failed
change is deleting one key. Had it held a mutable copy, rollback would need a
snapshot captured before the change, kept somewhere, and correctly discarded on
every exit path — three more things to get wrong, and the reason optimistic
updates are usually buggy.

**2. "Unit tests (Jest)" vs "type tests with `expectTypeOf` (from Vitest)."**

Both runners would mean two configs, two mocking APIs and two CI steps for one
suite. **Vitest only.** Its API is Jest-compatible (`describe` / `it` / `expect` /
`vi.fn`), so the Jest-style tests read exactly as specified, while
`--typecheck` covers the 40 type-level assertions.

**3. `<Suspense>` around a Server Component that `await`s its own data.**

If `page.tsx` awaits, the boundary never suspends — the child is already resolved
and the whole page waits on the slowest thing on it.

So `page.tsx` **does not await**. It creates the promise and hands it, unawaited,
to a nested async component *inside* the boundary. React streams the shell
immediately, shows the skeleton, and patches in the table when the promise settles.
Verified: the streamed HTML contains both the skeleton and the resolved table.

---

### .NET 9 on a machine where .NET 9 no longer installs

.NET 9 reached end of life in May 2026 and its SDK is no longer distributed. The
target framework is still `net9.0` and every package is a 9.x release, as
specified; the solution is built with the .NET 10 SDK, which compiles `net9.0`
faithfully.

`<RollForward>LatestMajor</RollForward>` is set in `Directory.Build.props` so
`dotnet test` and `dotnet run` work on a machine that has only .NET 10. Without it
the build succeeds and **every test aborts** with "You must install or update .NET
to run this application". Docker pins the runtime exactly
(`mcr.microsoft.com/dotnet/aspnet:9.0`), so the deployed image is unaffected.

---

### Things that look like duplication and are not

| Looks duplicated | Why it is not |
|---|---|
| FluentValidation **and** aggregate invariants | Different questions. The validator checks the *request* — required fields, UUID format, that a date and an assignee arrive together. The aggregate checks the *domain* — not in the past, transition legal. Neither restates the other, and the one rule that appears in both places (max title length) reads the aggregate's own constant. |
| `outbox_message_consumers` **and** `UNIQUE(idempotency_key)` | Different failure modes. The first catches redelivery of one *message*; the second catches the same business *fact* arriving by any other route — a manual replay, a backfill, a concurrent double-delivery. Only the second survives the outbox table being truncated. |
| `transitionJob`, `canTransition`, `allowedActionsFor`, `nextStatusFor` | Four projections of one table, each answering a different question: may this compile, may this be attempted, which buttons render, what status to paint optimistically. Adding a transition edits `JOB_TRANSITIONS` and nothing else. |
| A client-side transition guard **and** the backend aggregate | Only the backend is authoritative. The client check saves a round trip for a transition it can already prove illegal, and gives an immediate specific message instead of a spinner followed by a 409. Remove it and the system is still correct, only slower. |

And the one genuine duplication: **the state machine exists in both TypeScript and
C#.** Two runtimes cannot share a table. What is avoided is duplication *within*
each side — on the client one `const` drives the types, the runtime guard and the
action buttons; on the server one `FrozenDictionary` drives all five transition
methods.

---

### Design notes worth calling out

**A generated `sort_key` column.** `scheduled_date_utc` is nullable — drafts have
no date — and **a nullable pagination key breaks keyset pagination**: no comparison
operator gives a useful answer against `NULL`, so those rows vanish from every page
after the first. The column is `GENERATED ALWAYS AS (coalesce(scheduled_date_utc,
'infinity')) STORED`, which is directly indexable; a parameterised `COALESCE` in
the `WHERE` clause could not match an expression index.

**`SearchAsync<TProjection>(criteria, Expression<Func<Job, TProjection>>)`.** The
brief names three methods on the domain repository *and* asks for read-optimised
projections in the query handler. Passing the projection as an expression
satisfies both: EF translates it into a `SELECT` of exactly the requested columns
with no tracking, and no fourth interface is needed that would then be dead code.

**Module-scoped `IJobsUnitOfWork` / `IBillingUnitOfWork`.** Both `DbContext`s
implement `IUnitOfWork`, so a handler asking for the bare interface receives
whichever module registered last — a Jobs handler committing through Billing's
context would find no tracked changes and **save nothing while reporting success**.
A marker interface per module makes that a compile error.

**`force-dynamic` on `/jobs`.** Statically prerendering a multi-tenant
authenticated page is not an optimisation, it is a data leak: whichever
organisation's token the build machine held would be baked in and served to
everyone.

**A real 404.** `app/jobs/not-found.tsx` is reachable — `app/jobs/[jobId]/page.tsx`
calls `notFound()` when the API reports the job is absent. It reports the same
thing when the job belongs to another organisation, because distinguishing the two
would confirm to an attacker that an identifier is real.

**A directory endpoint rather than a Contacts module.** The create-job pickers
need customers and crew, and a job references both by identifier without owning
either — they belong to contexts this codebase does not implement. Modelling them
as aggregates would invent a lifecycle and invariants that do not exist: nothing
to enforce, no transition to guard, no rule that could be broken. It would also
put customer data inside the Jobs module, contradicting the boundary
`LayerDependencyTests` enforces. So `/api/directory/customers` and
`/api/directory/crew` serve fixed reference data from the composition root,
labelled as the stand-in they are.

The alternative — a hard-coded list in the frontend — was rejected because it puts
a second copy of those identifiers somewhere the API knows nothing about. Serving
them means the picker consumes a real HTTP contract, so replacing this with a
genuine Contacts module is a change of implementation behind an unchanged
endpoint, with no client edit at all.

**One transport, two repositories.** Adding the directory adapter would have meant
a second copy of the auth header, the timeout, the 401 handling and the
ProblemDetails translation. That logic moved to `api-client.ts` and both
repositories call it — a free function, not a base class, because they need a
transport rather than an ancestor.

---

## What was verified, not assumed

Every row below is observed output, not a claim about the code.

| | |
|---|---|
| Backend | 17 projects, `TreatWarningsAsErrors`, zero warnings |
| Backend tests | 103 — 60 aggregate/value object, 8 handler (Moq), 35 architecture (NetArchTest) |
| Frontend tests | 223 — 183 runtime (`npm test`), 40 type-level (`npm run test:types`) |
| Coverage | 93.3% lines, 96.5% branches, 94.4% functions — over `src`, thresholds at 80 |
| E2E | 11 Playwright specs against Next + .NET + PostgreSQL, nothing mocked |
| Multi-tenancy | A token for organisation B returns `items: 0` for organisation A's jobs |
| Async pipeline | Complete a job → outbox row → Hangfire → integration event → invoice row |
| Idempotency | Outbox replay produced **no second invoice**; log recorded `already consumed … skipping` |
| Invariants over HTTP | `400 Job.ScheduledInThePast` (aggregate) · `400 Validation.General` (FluentValidation) · `409 Job.InvalidTransition` (transition table) |
| Keyset vs OFFSET | 0.07 ms vs 6.90 ms at depth 2 400 — Index Only Scan vs Bitmap + Sort |
| Full-text | GIN index used via `BitmapAnd` on selective terms; ordered index preferred on common ones |

Six bugs surfaced only by running the system, and are fixed:

1. **API/UI contract mismatch** — the backend returned a flat address, the frontend
   expected a nested one. Fixed in the backend, which had the weaker design.
2. **`output: 'standalone'` silently broke Server Action revalidation** under
   `next start`. The database said `Completed` and the UI stayed on `In progress`.
   Now gated behind `BUILD_STANDALONE=1`, set only by the Dockerfile.
3. **The snake_case convention skipped value objects.** EF complex-type members are
   not in `GetProperties()`, so `Address_City` survived in PascalCase while every
   other column was converted. Fixed by recursing through `GetComplexProperties()`.
4. **The backend health check never ran once.** `docker compose up --wait` failed
   in CI while every unit suite was green. The check was `wget`, and the ASP.NET
   runtime image is Debian slim, which ships neither `wget` nor `curl` — so it
   exited 127 on every probe, the container was marked unhealthy after its twelve
   retries, and the frontend that depends on it never started. Nothing in the
   backend log said so, because a probe that never reaches the application cannot
   log. Local runs missed it because they use `dotnet run`, not the image. Fixed
   by installing `curl` in the runtime stage and declaring the check in the
   Dockerfile, where a `healthcheck:` block in Compose can no longer override it
   with something the image cannot execute.

   The frontend check had the same shape of flaw waiting behind it: it probed `/`,
   which redirects to a page that calls the API, so a slow backend would have
   reported the *frontend* as unhealthy. It now probes `/health`, which depends on
   nothing downstream.

5. **The create-job dialog overflowed its own box.** The address row is
   `2fr 1fr 1fr`, but a grid item defaults to `min-width: auto` and so refuses to
   shrink below its min-content width — and an `<input>` carries an intrinsic
   width of about twenty characters. Three of them demanded ~540px in the 528px
   the dialog has, so the controls hung outside it; `datetime-local`, being wider
   still, escaped first. Fixed with `min-width: 0` on the field and `width: 100%`
   on the control, plus a scrolling body so a short window cannot push the submit
   button out of reach either. The inline `style` objects those rows used are now
   classes: they were the only inline layout in the codebase, which is precisely
   why the broken rule lived somewhere no stylesheet could see or override.

   The first attempt at that fix introduced a worse bug. Making the dialog a
   flex column so its body could scroll put `display: flex` on `.modal` — which
   overrides the user-agent stylesheet's `display: none` for a **closed**
   `<dialog>`, leaving an empty bordered box rendered on the page. The E2E suite
   reported it as a modal that never disappeared after a successful submit, and
   the call log showed the `open` attribute already gone: the component was
   right, the stylesheet was wrong. The rule is now `.modal[open]`.

6. **The customer and assignee fields asked the user for a UUID.** Correct
   against the API and unusable by a human. They are dropdowns now, filled from
   `/api/directory/*` — see below for why that is an endpoint rather than a
   hard-coded list in the UI.

---

## Self-audit

After the implementation was complete and green, I ran a dedicated pass looking
for redundancy and dead code — including with a script that reports every exported
symbol with no reader and every six-line block duplicated across files. It found
seven things. All seven are fixed; the interesting ones are below.

**The projection `Job → JobResponse` was written twice, verbatim.** Seventeen
field assignments duplicated between `SearchJobsQueryHandler` and
`GetJobByIdQueryHandler`. Adding a field to `JobResponse` would have updated one
and silently left the other stale. Now defined once in `JobProjections`: an
`Expression` for EF Core to translate, and `.Compile()`d for the handler that
already holds a materialised aggregate. Duplicated blocks across the codebase went
from 10 to 0.

**I had justified `tryTransitionJob` with a reason that was not true.** This
README previously argued it existed "because the store needs a runtime-checked
path for state that arrives as an unnarrowed union". The store never called it —
its only caller was `transitionJob` itself. Removed.

What replaced it is the more useful finding: the optimistic-update hook was
writing `applyOptimisticStatus(id, 'InProgress')`, a **fourth** place encoding the
transition table's knowledge. It now asks `nextStatusFor(job.status, 'start')`, so
the target status comes from the table like everything else.

**The "pending" flag on a table row was measuring the wrong thing.** It read
`completion.target?.id === job.id` — "is the completion modal open for this row?"
— rather than "does this row have a change in flight?". A job being *started* (no
modal) never showed as pending, and a job merely being looked at did.
`useIsJobPending` already computed the right answer and was unused; it is now
where it belongs.

**The store's `pagination` slice had no reader.** `cursor`, `setCursor` and
`setPageSize` were written, tested, and never used by application code. Removed —
and it is a deliberate deviation from the brief, which lists `pagination` among the
store's responsibilities. Position belongs to the request the Server Component
makes, and that component cannot read a client store; a cursor kept in a store is
also lost on refresh and invisible to the back button. Keeping the state to satisfy
a bullet point would have been exactly the debt this pass existed to find.

**Two speculative helpers, removed.** `Result.FirstFailureOrSuccess` was written
for combining several value-object parses; only one is parsed, so nothing called
it. `__setContainerForTests` was written for integration tests that do not exist.

**And one finding left in place, stated rather than hidden.** Four Part 1
deliverables — `DeepReadonly`, `PathKeys`, `QueryBuilder`, `TypedEventEmitter` —
are exercised by their own test suites but are not consumed by the application.
They are the brief's own exercises, and forcing `QueryBuilder` into a frontend
whose SQL lives on the server would be contrived. The fifth, the `JobState`
machine, is fully wired: it decides which action buttons render, whether a
transition is attempted, and what status an optimistic update paints.

---

## Bonus items

Each was verified, not just wired up. Full evidence in
[`docs/performance/README.md`](docs/performance/README.md).

| | Status | Evidence |
|---|---|---|
| **Docker Compose + CI** | Done | `docker-compose.yml` runs the full stack; `.github/workflows/ci.yml` runs backend build+test, frontend lint/typecheck/test/build, and the E2E suite against the compose stack |
| **OpenTelemetry** | Done, **verified** | The Next.js server and the .NET API share one trace. Observed: the token request and the jobs request from one page render carried `traceparent` with the **same trace id** and different span ids; a second page load produced a new trace id |
| **Rate limiting** | Done | Sliding window, 100 requests / 60 s in six 10-second segments, partitioned by tenant claim (falling back to remote IP). A fixed window would allow a 2N burst across the boundary |
| **Accessibility** | Done, **verified** | axe reports **zero** WCAG 2.1 A/AA violations; six explicit keyboard and ARIA assertions cover what axe cannot check |
| **Performance** | Done, **measured** | Lighthouse (mobile profile): **Performance 99, Accessibility 100**, SEO 100, Best Practices 96. **CLS = 0**. The whole jobs feature is 7.66 kB of JavaScript |

The two Best Practices audits that fail are artefacts of the measurement — plain
HTTP on `localhost`, and `no-store` on the tenant-scoped route deliberately
preventing bfcache restoration. Neither is worth changing to move a number.

---

## What I would do next

Ordered by what I would reach for first, with the reason rather than the label.

1. **Replace the development token endpoint with a real identity provider.**
   `/api/dev/token` mints a token for whatever organisation is asked for. It is
   registered only outside Production and exists so the stack runs from `docker
   compose up` with no external dependency — but it is the one piece that is a
   stand-in rather than an implementation. `TokenProvider` is the single class that
   changes.

2. **Integration tests with Testcontainers.** The unit tests mock the repository
   and the E2E tests drive a browser; nothing exercises the EF Core query
   translation itself. A `WebApplicationFactory` against a throwaway PostgreSQL
   container would cover the layer where the generated SQL and the query filter
   actually live — the layer where the address-shape bug hid.

3. **Real pricing in Billing.** `StandardCompletionFee = 500m` is a named constant
   precisely so the seam is obvious. Real pricing reads a rate card or the
   materials logged against the job.

4. **A cursor-paginated infinite scroll.** The keyset machinery is complete and
   tested; the UI currently renders the first page and says more exist. Wiring
   `nextCursor` to a scroll handler is the remaining step.

5. **`ts_rank` ordering for full-text search.** The measured `EXPLAIN` shows the
   one case where the query degrades: a search matching many rows, paged deeply,
   where the sort is unavoidable. Ranking sidesteps the conflict entirely, and
   search results usually want relevance ordering anyway.
