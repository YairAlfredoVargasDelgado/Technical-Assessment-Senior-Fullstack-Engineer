using JobTracker.Common.Application.Abstractions.Clock;
using JobTracker.Common.Application.Abstractions.Messaging;
using JobTracker.Modules.Jobs.Application.Abstractions;
using JobTracker.Common.Domain.Results;
using JobTracker.Modules.Jobs.Application.Jobs.Shared;
using JobTracker.Modules.Jobs.Domain.Jobs;

using MediatR;

namespace JobTracker.Modules.Jobs.Application.Jobs.CompleteJob;

/// <summary>
/// Completes a job.
/// </summary>
/// <remarks>
/// <para>
/// The handler never constructs <c>JobCompletedDomainEvent</c>. The aggregate
/// raises it, from inside <c>Job.Complete</c>, after the transition has actually
/// been accepted. A handler raising it would announce a completion that a failed
/// guard may have refused — and the invoice generated downstream would be for
/// work that was never signed off.
/// </para>
/// <para>
/// The event reaches the outbox during <c>SaveChangesAsync</c>, in the same
/// transaction as the status change. There is no window in which the job is
/// completed but the invoice request was lost, and none in which an invoice is
/// requested for a completion that rolled back.
/// </para>
/// </remarks>
internal sealed class CompleteJobCommandHandler(
    IJobRepository jobRepository,
    IJobsUnitOfWork unitOfWork,
    IDateTimeProvider dateTimeProvider)
    : ICommandHandler<CompleteJobCommand, Unit>
{
    public async Task<Result<Unit>> Handle(CompleteJobCommand command, CancellationToken cancellationToken)
    {
        var job = await jobRepository.GetRequiredAsync(command.JobId, cancellationToken);
        if (job.IsFailure)
        {
            return Result.Failure<Unit>(job.Error);
        }

        var completed = job.Value.Complete(command.SignatureUrl, dateTimeProvider.UtcNow);
        if (completed.IsFailure)
        {
            return Result.Failure<Unit>(completed.Error);
        }

        await unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(Unit.Value);
    }
}
