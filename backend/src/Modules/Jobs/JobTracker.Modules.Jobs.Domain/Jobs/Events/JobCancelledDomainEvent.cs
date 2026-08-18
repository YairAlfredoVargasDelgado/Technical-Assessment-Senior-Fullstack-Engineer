using JobTracker.Common.Domain.Abstractions;

namespace JobTracker.Modules.Jobs.Domain.Jobs.Events;

/// <summary>Raised when a job is abandoned before completion.</summary>
public sealed record JobCancelledDomainEvent(
    Guid JobId,
    Guid OrganizationId,
    string Reason,
    DateTime CancelledAtUtc) : DomainEvent;
