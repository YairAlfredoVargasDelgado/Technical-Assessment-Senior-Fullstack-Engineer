using JobTracker.Common.Application.Abstractions.Messaging;
using JobTracker.Common.Application.Models;
using JobTracker.Modules.Jobs.Domain.Jobs;

namespace JobTracker.Modules.Jobs.Application.Jobs.SearchJobs;

/// <summary>
/// Searches jobs within the current tenant.
/// </summary>
/// <remarks>
/// No <c>OrganizationId</c> and no <c>Page</c>. The tenant is ambient and
/// enforced by a global query filter; the position is a <see cref="Cursor"/>
/// rather than a page number because offsets get slower the further a user
/// scrolls and skip rows when the underlying data changes mid-scroll.
/// </remarks>
public sealed record SearchJobsQuery(
    string? SearchTerm = null,
    IReadOnlyCollection<JobStatus>? Statuses = null,
    DateTime? ScheduledFromUtc = null,
    DateTime? ScheduledToUtc = null,
    Guid? AssigneeId = null,
    string? Cursor = null,
    int Limit = JobSearchCriteria.DefaultLimit) : IQuery<PagedList<JobResponse>>;
