using System.Linq.Expressions;

using JobTracker.Modules.Jobs.Domain.Jobs;
using JobTracker.Modules.Jobs.Infrastructure.Database.Configurations;

using Microsoft.EntityFrameworkCore;

using NpgsqlTypes;

namespace JobTracker.Modules.Jobs.Infrastructure.Jobs;

/// <summary>The read side: the projected, keyset-paginated search query.</summary>
internal sealed partial class JobRepository
{
    public async Task<IReadOnlyList<TProjection>> SearchAsync<TProjection>(
        JobSearchCriteria criteria,
        Expression<Func<Job, TProjection>> projection,
        CancellationToken cancellationToken = default)
    {
        // AsNoTracking: these rows are serialised and discarded. Enrolling them
        // in the change tracker would allocate an entry per row and make the
        // context progressively slower over a long-lived request for no benefit.
        var query = context.Jobs.AsNoTracking();

        query = ApplyFullTextSearch(query, criteria.SearchTerm);
        query = ApplyFilters(query, criteria);
        query = ApplyCursor(query, criteria.Cursor);

        return await query
            // The ordering must match the cursor comparison exactly, and both
            // must match ix_jobs_organization_sort_key_id, or Postgres sorts the
            // whole filtered set instead of walking the index.
            .OrderBy(job => EF.Property<DateTime>(job, JobSearchColumns.SortKey))
            .ThenBy(job => job.Id)
            // One row more than asked for: its presence is how the caller knows
            // another page exists, without a second COUNT over the same filters.
            .Take(criteria.Limit + 1)
            .Select(projection)
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Matches the stored <c>tsvector</c> against the search term.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <c>plainto_tsquery</c>, not <c>to_tsquery</c>: the input comes from a user
    /// typing into a search box, and <c>to_tsquery</c> would reject anything
    /// containing an unbalanced quote or a stray <c>&amp;</c> with a syntax error.
    /// <c>plainto_tsquery</c> treats the whole string as words to be AND-ed.
    /// </para>
    /// <para>
    /// Matching against the stored generated column rather than calling
    /// <c>to_tsvector(title || description)</c> inline is what lets the GIN index
    /// be used. The inline form is a different expression from the indexed one, so
    /// the planner cannot match them and falls back to a sequential scan.
    /// </para>
    /// </remarks>
    private static IQueryable<Job> ApplyFullTextSearch(IQueryable<Job> query, string? searchTerm)
    {
        if (string.IsNullOrWhiteSpace(searchTerm))
        {
            return query;
        }

        return query.Where(job =>
            EF.Property<NpgsqlTsVector>(job, JobSearchColumns.SearchVector)
                .Matches(EF.Functions.PlainToTsQuery("english", searchTerm)));
    }

    private static IQueryable<Job> ApplyFilters(IQueryable<Job> query, JobSearchCriteria criteria)
    {
        if (criteria.Statuses is { Count: > 0 })
        {
            // Materialised to an array so Npgsql renders `status = ANY(@p)` — one
            // parameter regardless of how many statuses were requested, which
            // keeps the plan cache from filling with a variant per list length.
            var statuses = criteria.Statuses.ToArray();
            query = query.Where(job => statuses.Contains(job.Status));
        }

        if (criteria.ScheduledFromUtc is { } from)
        {
            query = query.Where(job => job.ScheduledDateUtc >= from);
        }

        if (criteria.ScheduledToUtc is { } to)
        {
            query = query.Where(job => job.ScheduledDateUtc <= to);
        }

        if (criteria.AssigneeId is { } assigneeId)
        {
            query = query.Where(job => job.AssigneeId == assigneeId);
        }

        return query;
    }

    /// <summary>
    /// Resumes after the cursor's position.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The predicate is the row-comparison "(sort_key, id) &gt; (@key, @id)",
    /// written out because EF Core cannot translate C# tuple comparison. Both
    /// halves are required: without the <c>id</c> tiebreaker, rows sharing a sort
    /// key would be returned again on the next page or skipped entirely.
    /// </para>
    /// <para>
    /// This is what replaces <c>OFFSET</c>, and why: <c>OFFSET 100000</c> makes
    /// Postgres produce and discard a hundred thousand rows before returning
    /// anything, so cost grows with how far the user has scrolled. A keyset seeks
    /// straight to the position, so every page costs the same. It is also stable
    /// under concurrent writes — a row inserted while the user pages does not
    /// shift every later page by one and cause a record to be skipped.
    /// </para>
    /// </remarks>
    private static IQueryable<Job> ApplyCursor(IQueryable<Job> query, JobCursor? cursor)
    {
        if (cursor is null)
        {
            return query;
        }

        return query.Where(job =>
            EF.Property<DateTime>(job, JobSearchColumns.SortKey) > cursor.SortKeyUtc
            || (EF.Property<DateTime>(job, JobSearchColumns.SortKey) == cursor.SortKeyUtc
                && job.Id > cursor.Id));
    }
}
