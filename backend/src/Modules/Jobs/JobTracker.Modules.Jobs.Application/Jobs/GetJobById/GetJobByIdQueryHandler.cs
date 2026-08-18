using JobTracker.Common.Application.Abstractions.Messaging;
using JobTracker.Common.Domain.Results;
using JobTracker.Modules.Jobs.Application.Jobs.SearchJobs;
using JobTracker.Modules.Jobs.Application.Jobs.Shared;
using JobTracker.Modules.Jobs.Domain.Jobs;

namespace JobTracker.Modules.Jobs.Application.Jobs.GetJobById;

/// <summary>
/// Loads one job for the detail view.
/// </summary>
/// <remarks>
/// <para>
/// Uses <c>GetByIdAsync</c> — the write-side, tracked load — rather than a
/// projection. For a single row the change-tracking overhead is one entry, which
/// is not worth a fourth method on the domain repository interface to avoid. The
/// list endpoint is where projection matters, because there the saving is
/// multiplied by the page size.
/// </para>
/// <para>
/// A job belonging to another organisation is filtered out by the tenant query
/// filter, so it produces exactly the same <c>Job.NotFound</c> as an identifier
/// that never existed. That is deliberate: distinguishing the two would confirm
/// to an attacker that an identifier is real.
/// </para>
/// </remarks>
internal sealed class GetJobByIdQueryHandler(IJobRepository jobRepository)
    : IQueryHandler<GetJobByIdQuery, JobResponse>
{
    public async Task<Result<JobResponse>> Handle(GetJobByIdQuery query, CancellationToken cancellationToken)
    {
        var job = await jobRepository.GetRequiredAsync(query.JobId, cancellationToken);

        return job.IsFailure
            ? Result.Failure<JobResponse>(job.Error)
            : Result.Success(JobProjections.ToResponseFunc(job.Value));
    }
}
