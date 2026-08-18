using JobTracker.Common.Application.Abstractions.Clock;
using JobTracker.Common.Application.Abstractions.Messaging;
using JobTracker.Modules.Jobs.Application.Abstractions;
using JobTracker.Common.Domain.Results;
using JobTracker.Modules.Jobs.Application.Jobs.Shared;
using JobTracker.Modules.Jobs.Domain.Jobs;

using MediatR;

namespace JobTracker.Modules.Jobs.Application.Jobs.CancelJob;

internal sealed class CancelJobCommandHandler(
    IJobRepository jobRepository,
    IJobsUnitOfWork unitOfWork,
    IDateTimeProvider dateTimeProvider)
    : ICommandHandler<CancelJobCommand, Unit>
{
    public async Task<Result<Unit>> Handle(CancelJobCommand command, CancellationToken cancellationToken)
    {
        var job = await jobRepository.GetRequiredAsync(command.JobId, cancellationToken);
        if (job.IsFailure)
        {
            return Result.Failure<Unit>(job.Error);
        }

        var cancelled = job.Value.Cancel(command.Reason, dateTimeProvider.UtcNow);
        if (cancelled.IsFailure)
        {
            return Result.Failure<Unit>(cancelled.Error);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(Unit.Value);
    }
}
