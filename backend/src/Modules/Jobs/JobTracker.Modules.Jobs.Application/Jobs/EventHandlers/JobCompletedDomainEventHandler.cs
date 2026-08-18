using JobTracker.Common.Application.Abstractions.Messaging;
using JobTracker.Modules.Jobs.Domain.Jobs.Events;
using JobTracker.Modules.Jobs.IntegrationEvents;

using MediatR;

namespace JobTracker.Modules.Jobs.Application.Jobs.EventHandlers;

/// <summary>
/// Translates the internal completion fact into the module's published contract.
/// </summary>
/// <remarks>
/// <para>
/// <b>This class is the boundary.</b> On its left is <c>JobCompletedDomainEvent</c>,
/// a Jobs-internal type free to change with the module. On its right is
/// <c>JobCompletedIntegrationEvent</c>, a contract other teams depend on. Because
/// the translation happens here and nowhere else, Jobs can restructure its domain
/// freely and only this one file has to keep the published shape stable.
/// </para>
/// <para>
/// <b>When this runs.</b> Not during the completing transaction. The interceptor
/// writes the domain event to the outbox as part of that commit; Hangfire picks
/// it up afterwards and publishes it, which is when this handler executes. That
/// ordering is what makes the guarantee "if the job is completed, the invoice
/// will eventually be requested" rather than "usually both, sometimes one".
/// </para>
/// </remarks>
internal sealed class JobCompletedDomainEventHandler(IEventBus eventBus)
    : INotificationHandler<JobCompletedDomainEvent>
{
    public async Task Handle(JobCompletedDomainEvent notification, CancellationToken cancellationToken)
    {
        var integrationEvent = new JobCompletedIntegrationEvent
        {
            JobId = notification.JobId,
            JobTitle = notification.JobTitle,
            OrganizationId = notification.OrganizationId,
            CustomerId = notification.CustomerId,
            AssigneeId = notification.AssigneeId,

            // Carried through unchanged: together with JobId this is the
            // idempotency key every downstream consumer derives its own key from.
            // Re-stamping it with "now" here would make each redelivery look like
            // a different completion and defeat the whole mechanism.
            CompletedAtUtc = notification.CompletedAtUtc,
        };

        await eventBus.PublishAsync(integrationEvent, cancellationToken);
    }
}
