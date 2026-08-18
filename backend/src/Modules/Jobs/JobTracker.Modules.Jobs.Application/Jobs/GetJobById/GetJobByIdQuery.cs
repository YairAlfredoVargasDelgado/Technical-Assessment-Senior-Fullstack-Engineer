using JobTracker.Common.Application.Abstractions.Messaging;
using JobTracker.Modules.Jobs.Application.Jobs.SearchJobs;

namespace JobTracker.Modules.Jobs.Application.Jobs.GetJobById;

/// <summary>
/// Loads one job.
/// </summary>
/// <remarks>
/// Returns the same <see cref="JobResponse"/> the list uses rather than a
/// detail-specific DTO. A second shape carrying the same fields would be two
/// contracts to keep in step for no gain — and the moment the detail view needs
/// something extra (the photo list, an audit trail), that is when a distinct
/// response type earns its place.
/// </remarks>
public sealed record GetJobByIdQuery(Guid JobId) : IQuery<JobResponse>;
