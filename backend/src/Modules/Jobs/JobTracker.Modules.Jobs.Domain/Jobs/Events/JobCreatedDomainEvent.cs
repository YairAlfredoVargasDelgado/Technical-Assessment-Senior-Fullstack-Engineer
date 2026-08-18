using JobTracker.Common.Domain.Abstractions;

namespace JobTracker.Modules.Jobs.Domain.Jobs.Events;

/// <summary>
/// Raised when a job first comes into existence.
/// </summary>
/// <remarks>
/// Consumed <b>inside</b> the Jobs module to notify the assigned crew. It stays a
/// domain event rather than becoming an integration event because no other
/// bounded context has any interest in a job being created — Billing only cares
/// once work is finished. Publishing it across modules "just in case" would
/// create a contract nobody asked for and that we could then never change.
/// </remarks>
public sealed record JobCreatedDomainEvent(
    Guid JobId,
    Guid OrganizationId,
    Guid CustomerId,
    Guid? AssigneeId) : DomainEvent;
