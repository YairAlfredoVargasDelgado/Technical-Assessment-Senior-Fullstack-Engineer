using JobTracker.Common.Application.Abstractions.Messaging;

namespace JobTracker.Modules.Jobs.IntegrationEvents;

/// <summary>
/// Published when a job has been completed and signed off.
/// </summary>
/// <remarks>
/// <para>
/// <b>This assembly is the Jobs module's Open Host Service.</b> It is the only
/// part of Jobs that another module may reference. Billing reacts to this event
/// without ever seeing <c>Job</c>, <c>Address</c>, <c>JobStatus</c> or
/// <c>IJobRepository</c> — so Jobs is free to reshape its entire domain without
/// breaking anyone, and Billing cannot accidentally reach into Jobs' internals
/// because there is nothing there to reach.
/// </para>
/// <para>
/// <b>Only primitives.</b> Every property is a <c>Guid</c>, <c>string</c>,
/// <c>decimal</c> or <c>DateTime</c>. A domain type here would force consumers to
/// link against the producer's domain assembly and would make the contract
/// change every time that type did.
/// </para>
/// <para>
/// <b>Idempotency.</b> <see cref="JobId"/> together with
/// <see cref="CompletedAtUtc"/> forms the natural key for this business fact. The
/// Billing handler derives its idempotency key from the pair, so redelivery —
/// which the outbox's at-least-once guarantee makes inevitable — produces no
/// second invoice. See <c>docs/architecture/design-principles.md</c>.
/// </para>
/// <para>
/// <b>Versioning.</b> Changing this record is a breaking change to another team's
/// code. Additive, optional properties are safe; renaming, removing or
/// retightening a property is not, and requires a parallel
/// <c>JobCompletedIntegrationEventV2</c> published alongside this one until every
/// consumer has migrated.
/// </para>
/// </remarks>
public sealed record JobCompletedIntegrationEvent : IntegrationEvent
{
    public required Guid JobId { get; init; }

    public required Guid OrganizationId { get; init; }

    public required Guid CustomerId { get; init; }

    public required Guid AssigneeId { get; init; }

    public required string JobTitle { get; init; }

    public required DateTime CompletedAtUtc { get; init; }
}
