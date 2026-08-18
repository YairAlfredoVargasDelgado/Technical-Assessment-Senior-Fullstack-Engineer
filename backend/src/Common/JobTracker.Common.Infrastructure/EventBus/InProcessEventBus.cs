using JobTracker.Common.Application.Abstractions.Messaging;

using MediatR;

namespace JobTracker.Common.Infrastructure.EventBus;

/// <summary>
/// Delivers integration events to consumers running in the same process.
/// </summary>
/// <remarks>
/// <para>
/// Correct for a modular monolith, where every consumer is a class in the same
/// host. Its whole value is that publishers do not know this: they depend on
/// <see cref="IEventBus"/>, so extracting a module into its own service means
/// registering a broker-backed implementation instead — one line in the
/// composition root, no change to any publisher or consumer.
/// </para>
/// <para>
/// It is a thin adapter over MediatR rather than an abstraction with behaviour of
/// its own, which is intentional: an adapter that adds logic acquires a reason to
/// change, and this one should only ever change when the transport does.
/// </para>
/// </remarks>
public sealed class InProcessEventBus(IPublisher publisher) : IEventBus
{
    public Task PublishAsync<TIntegrationEvent>(
        TIntegrationEvent integrationEvent,
        CancellationToken cancellationToken = default)
        where TIntegrationEvent : IIntegrationEvent
        => publisher.Publish(integrationEvent, cancellationToken);
}
