using JobTracker.Common.Application.Abstractions.Messaging;
using JobTracker.Common.Application.Models;
using JobTracker.Common.Domain.Results;
using JobTracker.Modules.Jobs.Domain.Jobs;

namespace JobTracker.Modules.Jobs.Application.Jobs.SearchJobs;

/// <summary>
/// Read-optimised job search: projected, untracked, keyset-paginated.
/// </summary>
/// <remarks>
/// <para>
/// The projection below is a <see cref="Expression{TDelegate}"/>, not a
/// <c>Func</c>. That distinction is the whole optimisation: an expression is
/// translated into the <c>SELECT</c> list, so the database returns exactly these
/// columns; a delegate would force every <c>Job</c> row to be materialised in
/// full — with its photo collection and its change-tracking entry — and then
/// mapped in memory.
/// </para>
/// <para>
/// It is a <c>static</c> field rather than a lambda built per request so the
/// expression tree is allocated once and EF Core's compiled-query cache sees the
/// same instance every time.
/// </para>
/// <para>
/// The multi-tenant filter is absent on purpose. It is applied by a global query
/// filter on the <c>DbContext</c>, so it cannot be forgotten here or in any query
/// added later.
/// </para>
/// </remarks>
internal sealed class SearchJobsQueryHandler(IJobRepository jobRepository)
    : IQueryHandler<SearchJobsQuery, PagedList<JobResponse>>
{
    public async Task<Result<PagedList<JobResponse>>> Handle(
        SearchJobsQuery query,
        CancellationToken cancellationToken)
    {
        // The validator has already rejected a malformed cursor, so a null here
        // means "no cursor was supplied" — the first page.
        var cursor = JobCursorCodec.Decode(query.Cursor);

        var criteria = new JobSearchCriteria(
            query.SearchTerm,
            query.Statuses,
            query.ScheduledFromUtc,
            query.ScheduledToUtc,
            query.AssigneeId,
            cursor,
            query.Limit);

        var rows = await jobRepository.SearchAsync(criteria, JobProjections.ToResponse, cancellationToken);

        // The repository returns Limit + 1 rows; PagedList uses the surplus to
        // answer "is there more?" without a second COUNT query.
        var page = PagedList<JobResponse>.From(
            rows,
            query.Limit,
            row => JobCursorCodec.Encode(new JobCursor(row.ScheduledDateUtc ?? DateTime.MaxValue, row.Id)));

        return Result.Success(page);
    }
}
