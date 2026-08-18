using MediatR;

namespace JobTracker.Common.Application.Abstractions.Messaging;

/// <summary>
/// A fact published <b>across</b> module boundaries.
/// </summary>
/// <remarks>
/// <para>
/// The distinction from <c>IDomainEvent</c> is not ceremony — the two have
/// different audiences and therefore different rules:
/// </para>
/// <list type="bullet">
///   <item><b>Domain event</b> — internal to one module, may reference domain
///   types, dispatched in-process inside the transaction, free to change with
///   the module.</item>
///   <item><b>Integration event</b> — the module's published language. It lives
///   in a dedicated <c>*.IntegrationEvents</c> assembly, carries only primitives
///   so a consumer never links against the producer's domain, is serialised
///   through the outbox, and is versioned: changing it breaks other teams.</item>
/// </list>
/// <para>
/// Collapsing the two is the mistake that quietly turns a modular monolith back
/// into a big ball of mud, because <c>Billing</c> ends up referencing
/// <c>Jobs.Domain</c> to read an event and inherits every type it touches.
/// </para>
/// </remarks>
public interface IIntegrationEvent : INotification
{
    Guid Id { get; }

    DateTime OccurredOnUtc { get; }
}
