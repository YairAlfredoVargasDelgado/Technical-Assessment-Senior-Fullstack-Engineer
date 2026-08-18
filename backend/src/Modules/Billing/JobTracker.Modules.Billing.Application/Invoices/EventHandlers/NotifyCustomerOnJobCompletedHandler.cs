using JobTracker.Common.Application.Abstractions.Messaging;
using JobTracker.Common.Application.Abstractions.Notifications;
using JobTracker.Modules.Jobs.IntegrationEvents;

namespace JobTracker.Modules.Billing.Application.Invoices.EventHandlers;

/// <summary>
/// Emails the customer when their job is completed.
/// </summary>
/// <remarks>
/// <para>
/// A separate handler from invoice generation, subscribed to the same event.
/// Combining them would mean a mail-server outage rolls back the invoice, and a
/// pricing failure suppresses the customer's confirmation — two unrelated
/// concerns sharing a failure mode for no reason. Split, each retries on its own,
/// and the outbox ledger records them independently so a replay re-runs only the
/// one that failed.
/// </para>
/// <para>
/// Adding this required no change to the Jobs module, to the event, or to the
/// invoice handler: Open/Closed, delivered by the Observer pattern rather than
/// described.
/// </para>
/// </remarks>
internal sealed class NotifyCustomerOnJobCompletedHandler(IEmailSender emailSender)
    : IIntegrationEventHandler<JobCompletedIntegrationEvent>
{
    public async Task Handle(JobCompletedIntegrationEvent notification, CancellationToken cancellationToken)
    {
        // A customer directory lookup belongs here. Deriving the address keeps the
        // substitution to one line.
        var recipient = $"customer-{notification.CustomerId:N}@jobtracker.local";

        await emailSender.SendAsync(
            new EmailMessage(
                recipient,
                $"Your job \"{notification.JobTitle}\" is complete",
                $"Work finished on {notification.CompletedAtUtc:yyyy-MM-dd}. Your invoice will follow shortly."),
            cancellationToken);
    }
}
