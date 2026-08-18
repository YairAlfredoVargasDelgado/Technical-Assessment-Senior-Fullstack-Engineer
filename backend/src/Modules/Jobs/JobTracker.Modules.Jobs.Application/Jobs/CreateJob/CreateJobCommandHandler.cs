using JobTracker.Common.Application.Abstractions.Authentication;
using JobTracker.Common.Application.Abstractions.Clock;
using JobTracker.Common.Application.Abstractions.Messaging;
using JobTracker.Modules.Jobs.Application.Abstractions;
using JobTracker.Common.Domain.Results;
using JobTracker.Modules.Jobs.Domain.Jobs;

namespace JobTracker.Modules.Jobs.Application.Jobs.CreateJob;

/// <summary>
/// Orchestrates job creation. It decides nothing about whether the job is valid.
/// </summary>
/// <remarks>
/// <para>
/// <b>Controller (GRASP), and nothing more.</b> The handler's entire job is to
/// gather what the domain needs — the tenant, the clock — call the aggregate, and
/// commit. Every rule it appears to enforce is actually enforced by
/// <see cref="Address.Create"/> or by <see cref="Job"/>; the handler only
/// propagates the <c>Result</c> it is given.
/// </para>
/// <para>
/// That is what keeps it worth reading. A handler that re-checked the title
/// length, or compared the scheduled date to <c>DateTime.UtcNow</c>, would be a
/// second home for rules that already have one — and the two would drift.
/// </para>
/// <para>
/// <c>internal sealed</c>: nothing outside this assembly should construct or
/// derive from a handler. It is reached through MediatR, which resolves it from
/// the container.
/// </para>
/// </remarks>
internal sealed class CreateJobCommandHandler(
    IJobRepository jobRepository,
    IJobsUnitOfWork unitOfWork,
    ITenantContext tenantContext,
    IDateTimeProvider dateTimeProvider)
    : ICommandHandler<CreateJobCommand, Guid>
{
    public async Task<Result<Guid>> Handle(CreateJobCommand command, CancellationToken cancellationToken)
    {
        var address = Address.Create(
            command.Street,
            command.City,
            command.State,
            command.ZipCode,
            command.Latitude,
            command.Longitude);

        if (address.IsFailure)
        {
            return Result.Failure<Guid>(address.Error);
        }

        var utcNow = dateTimeProvider.UtcNow;

        // The tenant comes from the authenticated principal, never from the
        // request. See CreateJobCommand for why.
        var organizationId = tenantContext.OrganizationId;

        // Two named factories rather than one with optional arguments: the caller
        // has already told us which of the two things it wants, and the validator
        // has already established that the pair is coherent.
        var job = command is { ScheduledDateUtc: { } scheduledDate, AssigneeId: { } assigneeId }
            ? Job.CreateScheduled(
                command.Title,
                command.Description,
                address.Value,
                command.CustomerId,
                organizationId,
                scheduledDate,
                assigneeId,
                utcNow)
            : Job.CreateDraft(
                command.Title,
                command.Description,
                address.Value,
                command.CustomerId,
                organizationId,
                utcNow);

        if (job.IsFailure)
        {
            return Result.Failure<Guid>(job.Error);
        }

        await jobRepository.AddAsync(job.Value, cancellationToken);

        // Nothing has touched the database until this line. The insert and the
        // outbox row carrying JobCreatedDomainEvent commit together or not at all.
        await unitOfWork.SaveChangesAsync(cancellationToken);

        return Result.Success(job.Value.Id);
    }
}
