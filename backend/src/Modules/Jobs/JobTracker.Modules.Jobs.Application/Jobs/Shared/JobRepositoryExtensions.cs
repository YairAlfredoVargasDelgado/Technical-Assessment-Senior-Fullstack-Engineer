using JobTracker.Common.Domain.Results;
using JobTracker.Modules.Jobs.Domain.Jobs;

namespace JobTracker.Modules.Jobs.Application.Jobs.Shared;

/// <summary>
/// Turns "not found" from a <c>null</c> into a <c>Result</c>.
/// </summary>
/// <remarks>
/// <para>
/// Every mutating handler begins by loading a job and failing if it does not
/// exist. That is the one genuinely repeated fragment across them, and it is
/// factored out here so the <c>Job.NotFound</c> error is produced in exactly one
/// place.
/// </para>
/// <para>
/// <b>What is deliberately not abstracted.</b> The surrounding
/// load → mutate → save shape is left written out in each handler. Folding it
/// into a generic <c>ExecuteJobMutation(id, job =&gt; job.Complete(...))</c>
/// helper would save four lines per handler and cost the reader the transaction
/// boundary, the ordering, and the ability to read a use case top to bottom. The
/// repetition here is structural, not logical — the business rule in each handler
/// is the single domain call, and no two of those are the same.
/// </para>
/// </remarks>
internal static class JobRepositoryExtensions
{
    public static async Task<Result<Job>> GetRequiredAsync(
        this IJobRepository repository,
        Guid jobId,
        CancellationToken cancellationToken)
        => await repository.GetByIdAsync(jobId, cancellationToken) is { } job
            ? Result.Success(job)
            : Result.Failure<Job>(JobErrors.NotFound(jobId));
}
