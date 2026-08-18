using JobTracker.Common.Application.Abstractions.Messaging;

namespace JobTracker.Modules.Jobs.IntegrationEvents;

/// <summary>
/// Published when a job is abandoned before completion.
/// </summary>
/// <remarks>
/// Billing consumes this to void any provisional charge. It is a separate
/// contract from completion rather than a status field on one "JobStateChanged"
/// event, because a consumer that only cares about cancellations should not have
/// to subscribe to every state change and filter — that couples it to the full
/// set of states, which is exactly what the published language exists to hide.
/// </remarks>
public sealed record JobCancelledIntegrationEvent : IntegrationEvent
{
    public required Guid JobId { get; init; }

    public required Guid OrganizationId { get; init; }

    public required string Reason { get; init; }

    public required DateTime CancelledAtUtc { get; init; }
}
