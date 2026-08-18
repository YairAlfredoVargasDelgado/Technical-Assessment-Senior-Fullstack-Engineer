namespace JobTracker.Common.Application.Abstractions.Messaging;

/// <summary>
/// Carries integration events from the module that publishes them to the modules
/// that consume them.
/// </summary>
/// <remarks>
/// <para>
/// The abstraction exists so the transport is a deployment decision rather than a
/// design decision. Today the implementation dispatches in-process, because this
/// is a modular monolith and every consumer lives in the same host. The day a
/// module is extracted into its own service, the replacement is one class that
/// publishes to RabbitMQ — and no publisher or consumer changes, because none of
/// them ever knew which it was.
/// </para>
/// <para>
/// That is the Open/Closed and Dependency Inversion principles doing real work
/// rather than decorating a diagram: the modules depend on this interface, and
/// both the in-process and the broker implementations depend on it too.
/// </para>
/// </remarks>
public interface IEventBus
{
    Task PublishAsync<TIntegrationEvent>(
        TIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
        where TIntegrationEvent : IIntegrationEvent;
}
