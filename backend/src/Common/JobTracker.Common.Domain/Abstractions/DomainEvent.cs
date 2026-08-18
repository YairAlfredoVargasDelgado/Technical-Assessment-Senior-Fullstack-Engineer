namespace JobTracker.Common.Domain.Abstractions;

/// <summary>
/// Base record for domain events.
/// </summary>
/// <remarks>
/// A <c>record</c> rather than a class: domain events are immutable facts about
/// the past, and value equality is the semantics you want when asserting on them
/// in tests.
/// <para>
/// <see cref="OccurredOnUtc"/> is stamped at construction rather than at
/// dispatch. The event records when the fact occurred, not when the
/// infrastructure got around to noticing it — a distinction that matters once
/// the outbox introduces a delay between the two.
/// </para>
/// </remarks>
public abstract record DomainEvent : IDomainEvent
{
    protected DomainEvent()
    {
        Id = Guid.NewGuid();
        OccurredOnUtc = DateTime.UtcNow;
    }

    public Guid Id { get; init; }

    public DateTime OccurredOnUtc { get; init; }
}
