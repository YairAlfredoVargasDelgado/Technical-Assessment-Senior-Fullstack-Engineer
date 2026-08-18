# Performance and accessibility measurements

All figures below are measured output, reproducible with the commands given.
Raw reports are checked in beside this file.

---

## Lighthouse

```bash
cd frontend
CHROME_PATH=/path/to/chrome npx lighthouse http://localhost:3000/jobs \
  --output=json --output=html --output-path=../docs/performance/lighthouse-jobs \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless=new --no-sandbox"
```

Lighthouse 12.3.0, **mobile** emulation (the harsher of the two profiles — the
desktop profile does not apply CPU or network throttling).

| Category | Score |
|---|---|
| Performance | **99** |
| Accessibility | **100** |
| Best Practices | 96 |
| SEO | 100 |

### Core Web Vitals

| Metric | Value | Google's "good" threshold |
|---|---|---|
| First Contentful Paint | 0.8 s | < 1.8 s |
| Largest Contentful Paint | 1.9 s | < 2.5 s |
| Total Blocking Time | 90 ms | < 200 ms |
| **Cumulative Layout Shift** | **0** | < 0.1 |
| Speed Index | 0.8 s | < 3.4 s |
| Time to Interactive | 1.9 s | — |
| Server response (root document) | 30 ms | < 600 ms |

**CLS of exactly zero is the one to look at.** It is the direct consequence of the
skeleton mirroring the real table's column layout: when the streamed content
replaces the fallback, nothing below it moves. A skeleton of the wrong shape — or
no skeleton, with content appearing into empty space — is the usual source of a
non-zero CLS on a streaming page.

### Why Best Practices is 96, not 100

Two audits fail, and both are artefacts of how this measurement was taken rather
than defects in the application:

- **"Browser errors were logged to the console."** The page is served over plain
  HTTP on `localhost`, and the run is against a local API; the console entries are
  from that setup, not from application code.
- **"Page prevented back/forward cache restoration."** The route is
  `force-dynamic` and therefore `no-store`, which is deliberate: a multi-tenant
  authenticated page must not be restored from the bfcache with another session's
  data. This is a trade-off taken on purpose, and the correct one.

Neither is worth "fixing" to move a number.

---

## Bundle size

From `next build`:

```
Route (app)                          Size    First Load JS
┌ ○ /                                127 B         103 kB
├ ○ /_not-found                      993 B         104 kB
├ ƒ /jobs                          7.66 kB         110 kB     ← the whole feature
└ ƒ /jobs/[jobId]                    164 B         106 kB
+ First Load JS shared by all                      103 kB
```

**7.66 kB for the entire jobs feature** — the table, the filter bar, both modals,
the store, three feature slices and the state machine.

That number is a consequence of where the `'use client'` boundary sits. `page.tsx`,
`layout.tsx`, `JobsLoader` and `StatusBadge` are Server Components and ship no
JavaScript at all; only `JobsClient` and below cross into the browser. Marking
`page.tsx` as a Client Component instead — one line shorter — would have pulled the
container, the HTTP repository and the data fetch into this figure.

`ƒ` on both `/jobs` routes confirms they are server-rendered per request rather
than prerendered, which is what stops one tenant's data being baked into the build.

---

## Accessibility

Two independent measurements, because they check different things.

### axe (automated, in the E2E suite)

`frontend/e2e/accessibility.spec.ts`, run against the live application:

```
✓ the jobs list has no detectable WCAG 2.1 A/AA violations
✓ the create-job dialog has no detectable violations
✓ the dialog traps focus and Escape closes it
✓ the skip link is the first thing a keyboard user reaches
✓ the sorted column is announced, not only styled
✓ every row checkbox has an accessible name
```

**Zero violations** against `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`.

### What axe cannot check, and is asserted explicitly

axe covers roughly a third of WCAG — the machine-checkable third. It cannot tell
you whether the tab order is sensible or whether an announcement is useful. So the
suite also asserts, by driving the keyboard:

- **Focus is trapped inside the dialog** and Escape closes it. This comes from
  using the native `<dialog>` element with `showModal()` rather than a positioned
  `div`; a hand-rolled overlay has to reimplement the trap, background inertness
  and the top layer, and usually reimplements them incompletely.
- **The skip link is first in the tab order.** Without it a keyboard user tabs
  through the entire filter bar on every page load to reach the table.
- **`aria-sort` reflects the sorted column.** A screen-reader user cannot see the
  ▲/▼ glyph, so styling alone leaves them unable to tell which column is sorted.
- **`aria-pressed` on the filter toggles.** An "on" filter that differs only by
  background colour is invisible to assistive technology.
- **Every row checkbox has a name.** A column of unlabelled checkboxes is
  announced as "checkbox, checkbox, checkbox" — operable in principle, unusable in
  practice.

Also honoured, and not visible in any score: `prefers-reduced-motion` disables the
skeleton shimmer, and `:focus-visible` gives a keyboard-only focus ring rather
than suppressing outlines entirely.

---

## Where the render cost was designed out

Three decisions account for most of the numbers above.

**1. Derivation happens during render, not in an effect.**

```ts
const merged   = useMemo(() => mergeOptimisticPatches(serverJobs, patches), [serverJobs, patches]);
const filtered = useMemo(() => applyJobFilters(merged, filters),            [merged, filters]);
return           useMemo(() => applyJobSort(filtered, sortConfig),          [filtered, sortConfig]);
```

The `useEffect` + `setState` alternative renders twice per change, paints an empty
table on first render, and creates a second source of truth that can disagree with
its inputs. Three separate memos rather than one: typing in the search box changes
`filters` but not `patches`, so the merge does not re-run.

**2. Selectors are named functions returning one slice.**

`useJobsStore(selectFilters)` re-renders only when `filters` changes identity. A
selector that builds an object — `(s) => ({ a: s.a, b: s.b })` — returns a new
reference every time and re-renders on every store change, of any field.

**3. The steady state returns identical references.**

`mergeOptimisticPatches` returns the *same array* when there are no patches, and
`discardPatch` returns the same state object when there is nothing to discard.
Both are asserted in `jobs.store.test.ts`. A fresh object for a no-op would
invalidate every downstream `useMemo` and re-render the table for a state change
that did not happen.

---

## Reproducing

```bash
docker compose up -d --wait          # or run the API and frontend directly

cd frontend
npm run build                        # bundle sizes
npm run test:e2e                     # includes the accessibility suite
CHROME_PATH=$(which chromium) npx lighthouse http://localhost:3000/jobs \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless=new --no-sandbox"
```
