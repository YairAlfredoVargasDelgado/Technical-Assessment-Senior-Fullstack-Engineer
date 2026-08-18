-- =============================================================================
-- Job search: full-text + status + date range + keyset pagination + photo count
-- =============================================================================
--
-- This is the hand-written form of the query EF Core produces for
-- `SearchJobsQueryHandler`. It is kept here so the plan can be inspected with
-- EXPLAIN without going through the application, and so the indexing strategy
-- has somewhere to be explained.
--
-- Every parameter except the tenant is optional. The `@param IS NULL OR ...`
-- idiom keeps that to one statement rather than a query builder that assembles
-- SQL strings — see the note on plan caching at the bottom for what that costs
-- and why it is still the right trade here.
-- =============================================================================

-- $1  organization_id   uuid       -- tenant. Never optional.
-- $2  search_term       text       -- NULL for no full-text filter
-- $3  statuses          text[]     -- NULL or empty for all statuses
-- $4  scheduled_from    timestamptz
-- $5  scheduled_to      timestamptz
-- $6  assignee_id       uuid
-- $7  cursor_sort_key   timestamptz -- NULL for the first page
-- $8  cursor_id         uuid
-- $9  page_size         int

SELECT
    j.id,
    j.title,
    j.description,
    j.status,
    j.address_street,
    j.address_city,
    j.address_state,
    j.address_zip_code,
    j.address_latitude,
    j.address_longitude,
    j.scheduled_date_utc,
    j.assignee_id,
    j.customer_id,
    j.created_at_utc,
    j.updated_at_utc,

    -- Photo count via LATERAL rather than LEFT JOIN + GROUP BY.
    --
    -- A join would multiply the job row by its photos and then collapse the
    -- result, which forces an aggregation over every matching photo of every
    -- matching job. LATERAL runs a bounded index-only count per returned row —
    -- and only for the rows that survive the LIMIT, because it is evaluated
    -- after the outer scan. With `ix_job_photos_job_id` in place, each count is
    -- an index-only scan.
    --
    -- A correlated scalar subquery in the SELECT list plans identically here;
    -- LATERAL is preferred because it extends to returning more than one column
    -- (say, the most recent photo's URL) without a second subquery.
    photos.count AS photo_count

FROM jobs.jobs AS j

LEFT JOIN LATERAL (
    SELECT count(*) AS count
    FROM jobs.job_photos AS p
    WHERE p.job_id = j.id
) AS photos ON TRUE

WHERE
    -- Tenant first, always. It is the leading column of every index below, and
    -- in the application it is applied by an EF global query filter so it cannot
    -- be omitted by a query that forgets it.
    j.organization_id = $1

    -- Full-text. Matches the STORED generated column, not an inline
    -- `to_tsvector(title || description)` — an inline call is a different
    -- expression from the indexed one, so the planner cannot use
    -- `ix_jobs_search_vector` and falls back to a sequential scan.
    --
    -- plainto_tsquery, not to_tsquery: the term comes from a user's search box,
    -- and to_tsquery raises a syntax error on an unbalanced quote or a stray '&'.
    AND ($2 IS NULL OR j.search_vector @@ plainto_tsquery('english', $2))

    -- `= ANY($3)` rather than `IN (...)`: one parameter regardless of how many
    -- statuses are requested, so the plan cache holds one entry instead of one
    -- per list length.
    AND ($3 IS NULL OR cardinality($3) = 0 OR j.status = ANY($3))

    AND ($4 IS NULL OR j.scheduled_date_utc >= $4)
    AND ($5 IS NULL OR j.scheduled_date_utc <= $5)
    AND ($6 IS NULL OR j.assignee_id = $6)

    -- ---------------------------------------------------------------------
    -- Keyset pagination.
    --
    -- Row comparison, so the predicate matches the ORDER BY exactly and
    -- Postgres can seek into `ix_jobs_organization_sort_key_id` rather than
    -- sort the filtered set.
    --
    -- `sort_key` is a generated column: coalesce(scheduled_date_utc, 'infinity').
    -- The coalesce cannot live here — a parameterised expression in the WHERE
    -- clause cannot match an expression index — and it cannot be omitted either,
    -- because a draft has no scheduled date and NULL breaks every comparison,
    -- silently dropping unscheduled jobs from every page after the first.
    --
    -- The `id` tiebreaker is not optional. Several jobs can be booked for the
    -- same morning; without it, rows sharing a sort key are returned twice or
    -- skipped entirely, depending on whether the operator is `>` or `>=`.
    -- ---------------------------------------------------------------------
    AND ($7 IS NULL OR (j.sort_key, j.id) > ($7, $8))

ORDER BY j.sort_key, j.id

-- One row more than the caller asked for. Its presence answers "is there another
-- page?" — which is why this query needs no companion COUNT(*), the second half
-- of what makes OFFSET pagination expensive.
LIMIT $9 + 1;


-- =============================================================================
-- Indexing strategy
-- =============================================================================
--
--   ix_jobs_organization_sort_key_id  (organization_id, sort_key, id)
--       The pagination index. Its column order mirrors the ORDER BY exactly, so
--       the LIMIT is satisfied by walking the index and stopping — no sort node,
--       and cost independent of how deep the user has paged.
--
--   ix_jobs_organization_status_scheduled_date  (organization_id, status, scheduled_date_utc)
--       Serves the common filtered view ("scheduled jobs this week") where the
--       status predicate is selective enough to beat the pagination index.
--
--   ix_jobs_search_vector  GIN (search_vector)
--       Inverted: maps each lexeme to the rows containing it. A B-tree cannot
--       index a tsvector usefully — a row has many lexemes and B-tree assumes one
--       key per row.
--
--   ix_jobs_organization_assignee  (organization_id, assignee_id) WHERE assignee_id IS NOT NULL
--       Partial: drafts have no assignee, and there is no query that asks for
--       "jobs with no crew, by crew". Excluding those rows keeps the index
--       smaller and its scans shorter.
--
--   ix_job_photos_job_id  (job_id)
--       Makes the LATERAL count an index-only scan.
--
-- -----------------------------------------------------------------------------
-- Measured: GIN and B-tree cannot be one index
-- -----------------------------------------------------------------------------
--
-- When a search term IS supplied, this query has two independently indexable
-- predicates served by structurally different indexes, and no index can provide
-- both the ordering and the full-text filter — GIN has no concept of order.
--
-- The numbers below are from EXPLAIN (ANALYZE) against 50 000 jobs spread over
-- 20 tenants (2 500 rows for the tenant under test), on PostgreSQL 16. They are
-- measurements, not estimates.
--
--   term         matches   plan chosen                            time
--   ----------   -------   -----------------------------------    --------
--   'roof'          1071   Index Scan  ix_..._sort_key_id         0.26 ms
--   'chimney'        357   Index Scan  ix_..._sort_key_id         0.33 ms
--   'helicopter'       0   BitmapAnd(tenant idx, GIN) + Sort      3.68 ms
--
-- The planner switches strategy on estimated selectivity, and both plans are
-- worth having:
--
--   * When enough rows match, walking the ordered index and filtering reaches
--     the LIMIT after a few dozen rows. The GIN index is not used, and would not
--     help — it would return a large match set that then had to be sorted.
--
--   * When almost nothing matches, that same walk would scan the tenant's entire
--     partition to prove it. Here the planner falls back to GIN, and the GIN
--     index is what bounds the work.
--
-- So the GIN index earns its place on precisely the queries where the ordered
-- index degrades. Dropping it because "the planner does not seem to use it"
-- would leave the pathological case unprotected.
--
-- The residual weakness is a search that matches a very large number of rows AND
-- is paged deeply: the sort is then unavoidable. Two mitigations, neither adopted
-- because neither is warranted at this scale:
--
--   * rank the results (ts_rank) and paginate on rank — search results usually
--     want relevance ordering anyway, which sidesteps the conflict entirely;
--   * bound the searchable window (scheduled_date_utc > now() - interval '1 year')
--     so the sortable set stays bounded.
--
-- =============================================================================
-- Why cursor pagination rather than OFFSET
-- =============================================================================
--
-- 1. COST. `OFFSET N` does not skip rows — Postgres produces and discards all N
--    before returning the next page. Cost grows linearly with depth, so the last
--    page of a large result set is the most expensive query in the system. A
--    keyset seeks directly to the position: every page costs the same.
--
--    Measured on the same 50 000-row fixture, both fetching 21 rows from the same
--    position (row 2 400 of one tenant's 2 500):
--
--      OFFSET 2400   Bitmap Heap Scan (2 500 rows) -> Sort (2 421 rows)   6.90 ms
--      keyset        Index Only Scan (21 rows)                            0.07 ms
--
--    Roughly 90x, and the gap widens with depth. Note also that the keyset plan
--    is an INDEX ONLY scan: it never touches the heap, because the index carries
--    every column the predicate and the ordering need.
--
-- 2. CORRECTNESS UNDER CONCURRENT WRITES. Offsets are positional. A job inserted
--    while the user is on page 3 shifts every later row by one, so the first row
--    of page 4 is the one they already saw at the end of page 3 — and one row is
--    never shown at all. A cursor names a row, not a position, so inserts and
--    deletes elsewhere in the set cannot cause a skip or a repeat.
--
-- 3. NO COMPANION COUNT. Offset pagination usually ships with `COUNT(*)` over the
--    same filters to render "page 4 of 87" — a second full scan of the filtered
--    set, often costlier than the page itself. Fetching one surplus row replaces
--    it.
--
-- What OFFSET buys, and what is given up: random access to page N. A keyset can
-- only move forwards and backwards from a known position. For an infinite-scroll
-- job list that is not a loss; for a report where an auditor jumps to page 40, it
-- is, and OFFSET is the right choice there.
