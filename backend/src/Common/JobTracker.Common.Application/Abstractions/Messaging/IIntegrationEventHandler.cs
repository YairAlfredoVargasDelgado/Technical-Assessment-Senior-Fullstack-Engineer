using MediatR;

namespace JobTracker.Common.Application.Abstractions.Messaging;

/// <summary>
/// Reacts to an integration event published by another module.
/// </summary>
/// <remarks>
/// Handlers must be <b>idempotent</b>. The outbox guarantees at-least-once
/// delivery, so a handler will eventually be invoked twice for the same event —
/// after a crash between "handler committed" and "outbox row marked processed",
/// or after a retry on a transient failure. See
/// <c>docs/architecture/design-principles.md</c> for how the Billing module enforces this.
/// </remarks>
public interface IIntegrationEventHandler<in TIntegrationEvent> : INotificationHandler<TIntegrationEvent>
    where TIntegrationEvent : IIntegrationEvent;
