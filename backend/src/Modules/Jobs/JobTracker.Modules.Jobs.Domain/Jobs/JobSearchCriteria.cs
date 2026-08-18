namespace JobTracker.Modules.Jobs.Domain.Jobs;

/// <summary>
/// The filters a job search may apply.
/// </summary>
/// <remarks>
/// A parameter object rather than eight arguments on <c>SearchAsync</c>. Eight
/// positional parameters — four of them nullable and three of them
/// <c>DateTime?</c> — is a signature callers get wrong silently by transposing
/// two of the same type. It also means adding a filter changes every call site.
/// </remarks>
/// <param name="SearchTerm">Full-text term matched against title and description.</param>
/// <param name="Statuses">Statuses to include; <c>null</c> or empty means all.</param>
/// <param name="ScheduledFromUtc">Inclusive lower bound on the scheduled date.</param>
/// <param name="ScheduledToUtc">Inclusive upper bound on the scheduled date.</param>
/// <param name="AssigneeId">Restrict to one crew member.</param>
/// <param name="Cursor">Position to resume from; <c>null</c> for the first page.</param>
/// <param name="Limit">Maximum rows to return.</param>
public sealed record JobSearchCriteria(
    string? SearchTerm = null,
    IReadOnlyCollection<JobStatus>? Statuses = null,
    DateTime? ScheduledFromUtc = null,
    DateTime? ScheduledToUtc = null,
    Guid? AssigneeId = null,
    JobCursor? Cursor = null,
    int Limit = JobSearchCriteria.DefaultLimit)
{
    public const int DefaultLimit = 20;

    /// <summary>
    /// Upper bound on page size.
    /// </summary>
    /// <remarks>
    /// Enforced here rather than trusted from the request: without it, a client
    /// asking for <c>?limit=1000000</c> turns a paginated endpoint into a full
    /// table scan and a denial of service.
    /// </remarks>
    public const int MaxLimit = 100;
}
