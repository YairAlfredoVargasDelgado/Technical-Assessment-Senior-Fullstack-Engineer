namespace JobTracker.Modules.Jobs.Domain.Jobs;

/// <summary>
/// Where a job sits in its lifecycle.
/// </summary>
/// <remarks>
/// Persisted as a string rather than its ordinal (see
/// <c>JobTracker.Common.Infrastructure.Conventions</c>). Storing <c>2</c> means
/// reordering this enum silently rewrites the meaning of every existing row, and
/// makes every ad-hoc SQL query an exercise in remembering what <c>2</c> was.
/// </remarks>
public enum JobStatus
{
    Draft = 0,
    Scheduled = 1,
    InProgress = 2,
    Completed = 3,
    Cancelled = 4,
}
