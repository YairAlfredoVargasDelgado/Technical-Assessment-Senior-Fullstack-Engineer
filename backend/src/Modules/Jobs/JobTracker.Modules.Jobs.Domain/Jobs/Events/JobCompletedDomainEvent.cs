using JobTracker.Common.Domain.Abstractions;

namespace JobTracker.Modules.Jobs.Domain.Jobs.Events;

/// <summary>
/// Raised when a job is finished and signed off.
/// </summary>
/// <remarks>
/// <para>
/// This one crosses a boundary. Its in-module handler translates it into
/// <c>JobCompletedIntegrationEvent</c>, which the outbox persists in the same
/// transaction and Hangfire later dispatches to Billing (invoice generation) and
/// to notifications (customer email).
/// </para>
/// <para>
/// <see cref="CompletedAtUtc"/> is carried explicitly because it is half of the
/// idempotency key downstream: <c>JobId + CompletedAtUtc</c> identifies this
/// completion uniquely, so a redelivered message produces no second invoice.
/// </para>
/// </remarks>
public sealed record JobCompletedDomainEvent(
    Guid JobId,
    string JobTitle,
    Guid OrganizationId,
    Guid CustomerId,
    Guid AssigneeId,
    DateTime CompletedAtUtc) : DomainEvent;
