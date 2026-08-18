using MediatR;

namespace JobTracker.Common.Domain.Abstractions;

/// <summary>
/// Something that happened <b>inside</b> a single module, expressed in that
/// module's own ubiquitous language.
/// </summary>
/// <remarks>
/// Domain events are deliberately module-private. They may reference domain
/// types, they are dispatched in-process within the same transaction, and they
/// carry no compatibility promise to anyone outside the module. When another
/// bounded context needs to react, the module publishes an
/// <c>IIntegrationEvent</c> from its <c>IntegrationEvents</c> assembly instead —
/// see <c>docs/architecture/design-principles.md</c> for why the two are not the same thing.
/// <para>
/// Extending <see cref="INotification"/> lets MediatR fan out to any number of
/// handlers without the aggregate knowing that any of them exist: the Observer
/// pattern, with the mediator supplying the subscriber registry.
/// </para>
/// </remarks>
public interface IDomainEvent : INotification
{
    Guid Id { get; }

    DateTime OccurredOnUtc { get; }
}
