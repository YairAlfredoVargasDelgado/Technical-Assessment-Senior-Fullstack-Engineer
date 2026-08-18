using JobTracker.Common.Application.Abstractions.Clock;
using JobTracker.Common.Application.Abstractions.Messaging;
using JobTracker.Modules.Jobs.Application.Abstractions;
using JobTracker.Common.Domain.Results;
using JobTracker.Modules.Jobs.Application.Jobs.Shared;
using JobTracker.Modules.Jobs.Domain.Jobs;

using MediatR;

namespace JobTracker.Modules.Jobs.Application.Jobs.StartJob;

/// <summary>
/// Starts a job.
/// </summary>
/// <remarks>
/// The rule "only a scheduled job may start" is not written here. It lives in the
/// aggregate's transition table; this handler simply reports whatever the
/// aggregate decides.
/// </remarks>
internal sealed class StartJobCommandHandler(
    IJobRepository jobRepository,
    IJobsUnitOfWork unitOfWork,
    IDateTimeProvider dateTimeProvider)
    : ICommandHandler<StartJobCommand, Unit>
{
    public async Task<Result<Unit>> Handle(StartJobCommand command, CancellationToken cancellationToken)
    {
        var job = await jobRepository.GetRequiredAsync(command.JobId, cancellationToken);
        if (job.IsFailure)
        {
            return Result.Failure<Unit>(job.Error);
        }

        var started = job.Value.Start(dateTimeProvider.UtcNow);
        if (started.IsFailure)
        {
            return Result.Failure<Unit>(started.Error);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(Unit.Value);
    }
}
