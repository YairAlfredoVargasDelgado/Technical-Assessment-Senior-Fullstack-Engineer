using JobTracker.Common.Application.Abstractions.Notifications;
using JobTracker.Modules.Jobs.Domain.Jobs.Events;

using MediatR;

using Microsoft.Extensions.Logging;

namespace JobTracker.Modules.Jobs.Application.Jobs.EventHandlers;

/// <summary>
/// Notifies the assigned crew that a job has been booked in.
/// </summary>
/// <remarks>
/// <para>
/// <b>Stays a domain event.</b> No other bounded context cares that a job was
/// created, so promoting this to an integration event would publish a contract
/// nobody consumes — and one we could then never change without a migration
/// plan. The rule of thumb: a fact becomes an integration event when a second
/// module needs it, not before.
/// </para>
/// <para>
/// <b>Open/Closed in practice.</b> This handler was added without touching the
/// <c>Job</c> aggregate or <c>CreateJobCommandHandler</c>. A second reaction —
/// pushing to a mobile device, writing an audit row — is another class beside
/// this one, again with no edit to the code that raises the event.
/// </para>
/// <para>
/// The handler swallows nothing: a delivery failure propagates, the outbox
/// message is left unprocessed, and Hangfire retries it. That is the correct
/// behaviour for an at-least-once pipeline, and it is why the recipient must
/// tolerate a duplicate notification.
/// </para>
/// </remarks>
internal sealed class NotifyCrewOnJobCreatedHandler(
    IEmailSender emailSender,
    ILogger<NotifyCrewOnJobCreatedHandler> logger)
    : INotificationHandler<JobCreatedDomainEvent>
{
    public async Task Handle(JobCreatedDomainEvent notification, CancellationToken cancellationToken)
    {
        if (notification.AssigneeId is not { } assigneeId)
        {
            // A draft has no crew yet. Scheduling it later raises its own event.
            logger.LogDebug("Job {JobId} was created without an assignee; no crew to notify.", notification.JobId);
            return;
        }

        // A directory lookup would resolve the crew member's address. Deriving it
        // is a stand-in, isolated to this line so the real lookup replaces it
        // without touching the notification flow.
        var recipient = $"crew-{assigneeId:N}@jobtracker.local";

        await emailSender.SendAsync(
            new EmailMessage(
                recipient,
                "You have been assigned a new job",
                $"Job {notification.JobId} has been assigned to you."),
            cancellationToken);
    }
}
