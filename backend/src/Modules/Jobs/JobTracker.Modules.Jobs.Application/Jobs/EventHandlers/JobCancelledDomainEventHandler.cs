using JobTracker.Common.Application.Abstractions.Messaging;
using JobTracker.Modules.Jobs.Domain.Jobs.Events;
using JobTracker.Modules.Jobs.IntegrationEvents;

using MediatR;

namespace JobTracker.Modules.Jobs.Application.Jobs.EventHandlers;

/// <summary>Publishes cancellation to the other bounded contexts.</summary>
internal sealed class JobCancelledDomainEventHandler(IEventBus eventBus)
    : INotificationHandler<JobCancelledDomainEvent>
{
    public async Task Handle(JobCancelledDomainEvent notification, CancellationToken cancellationToken)
        => await eventBus.PublishAsync(
            new JobCancelledIntegrationEvent
            {
                JobId = notification.JobId,
                OrganizationId = notification.OrganizationId,
                Reason = notification.Reason,
                CancelledAtUtc = notification.CancelledAtUtc,
            },
            cancellationToken);
}
