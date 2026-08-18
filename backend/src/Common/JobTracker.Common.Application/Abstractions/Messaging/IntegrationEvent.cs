namespace JobTracker.Common.Application.Abstractions.Messaging;

/// <summary>Base record for integration events.</summary>
/// <remarks>
/// Properties are <c>init</c> rather than <c>get</c>-only so the JSON
/// deserialiser can rehydrate an event out of the outbox without a bespoke
/// converter per event type.
/// </remarks>
public abstract record IntegrationEvent : IIntegrationEvent
{
    protected IntegrationEvent()
    {
        Id = Guid.NewGuid();
        OccurredOnUtc = DateTime.UtcNow;
    }

    public Guid Id { get; init; }

    public DateTime OccurredOnUtc { get; init; }
}
