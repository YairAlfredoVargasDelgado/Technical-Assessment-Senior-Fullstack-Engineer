namespace JobTracker.Common.Domain.Abstractions;

/// <summary>
/// The single entry point into a consistency boundary.
/// </summary>
/// <remarks>
/// Everything inside the boundary is reachable only through the root, and the
/// root is the only thing a repository loads or saves. That is what makes an
/// invariant spanning several objects enforceable: there is exactly one place
/// the change can enter.
/// <para>
/// Raised events are buffered rather than dispatched immediately. Dispatching
/// mid-method would let a handler observe the aggregate half-way through a state
/// change; instead the Unit of Work collects them after the change is complete
/// and hands them to the outbox inside the same transaction.
/// </para>
/// </remarks>
public abstract class AggregateRoot : Entity
{
    private readonly List<IDomainEvent> _domainEvents = [];

    protected AggregateRoot(Guid id) : base(id)
    {
    }

    protected AggregateRoot()
    {
    }

    /// <summary>
    /// Events raised since the last <see cref="ClearDomainEvents"/>.
    /// </summary>
    /// <remarks>
    /// Exposed as <see cref="IReadOnlyCollection{T}"/> over a private list so
    /// callers can read the events but cannot inject one — only the aggregate's
    /// own methods decide what happened to it.
    /// </remarks>
    public IReadOnlyCollection<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    public void ClearDomainEvents() => _domainEvents.Clear();

    protected void Raise(IDomainEvent domainEvent) => _domainEvents.Add(domainEvent);
}
