using JobTracker.Common.Application.Abstractions.Clock;
using JobTracker.Common.Application.Abstractions.Messaging;
using JobTracker.Modules.Billing.Application.Abstractions;
using JobTracker.Modules.Billing.Domain.Invoices;
using JobTracker.Modules.Jobs.IntegrationEvents;

using Microsoft.Extensions.Logging;

namespace JobTracker.Modules.Billing.Application.Invoices.EventHandlers;

/// <summary>
/// Raises an invoice when a job is completed.
/// </summary>
/// <remarks>
/// <para>
/// <b>The only place Billing touches Jobs.</b> The single <c>using</c> pointing at
/// the Jobs module names its <c>IntegrationEvents</c> assembly — the published
/// contract — and nothing else is reachable from here. Billing has no way to load
/// a <c>Job</c>, read its status, or call into its domain, because those types are
/// not on its reference graph at all. Low coupling enforced by the compiler
/// rather than by review.
/// </para>
/// <para>
/// <b>Idempotency, in two layers.</b> The outbox has already filtered out
/// redelivery of this exact message. This handler additionally derives a key from
/// <c>JobId + CompletedAtUtc</c>, which catches the same fact arriving by any
/// other route. The <c>Exists</c> check below is only the cheap path; the unique
/// index on <c>idempotency_key</c> is what actually holds, because the check and
/// the insert are not atomic.
/// </para>
/// </remarks>
internal sealed class GenerateInvoiceOnJobCompletedHandler(
    IInvoiceRepository invoiceRepository,
    IBillingUnitOfWork unitOfWork,
    IDateTimeProvider dateTimeProvider,
    ILogger<GenerateInvoiceOnJobCompletedHandler> logger)
    : IIntegrationEventHandler<JobCompletedIntegrationEvent>
{
    /// <summary>
    /// Placeholder pricing.
    /// </summary>
    /// <remarks>
    /// A real system prices from a contract, a rate card, or the materials logged
    /// against the job — none of which exist in this assessment's scope. It is a
    /// named constant rather than a literal buried in the method so the seam is
    /// obvious to whoever implements pricing.
    /// </remarks>
    private const decimal StandardCompletionFee = 500m;
    private const string DefaultCurrency = "USD";

    public async Task Handle(JobCompletedIntegrationEvent notification, CancellationToken cancellationToken)
    {
        var idempotencyKey = Invoice.BuildIdempotencyKey(notification.JobId, notification.CompletedAtUtc);

        if (await invoiceRepository.ExistsWithIdempotencyKeyAsync(idempotencyKey, cancellationToken))
        {
            logger.LogInformation(
                "An invoice already exists for job {JobId} completed at {CompletedAtUtc}; skipping.",
                notification.JobId,
                notification.CompletedAtUtc);
            return;
        }

        var total = Money.Create(StandardCompletionFee, DefaultCurrency);
        if (total.IsFailure)
        {
            // Unreachable with constant inputs, and left in rather than assumed
            // away: the day pricing becomes dynamic, this branch is already the
            // place that handles a bad amount.
            logger.LogError("Could not price job {JobId}: {Error}", notification.JobId, total.Error.Description);
            return;
        }

        var invoice = Invoice.IssueForCompletedJob(
            notification.OrganizationId,
            notification.CustomerId,
            notification.JobId,
            total.Value,
            notification.CompletedAtUtc,
            dateTimeProvider.UtcNow);

        if (invoice.IsFailure)
        {
            logger.LogError(
                "Could not raise an invoice for job {JobId}: {Error}",
                notification.JobId,
                invoice.Error.Description);
            return;
        }

        await invoiceRepository.AddAsync(invoice.Value, cancellationToken);
        await unitOfWork.SaveChangesAsync(cancellationToken);

        logger.LogInformation(
            "Invoice {InvoiceId} raised for job {JobId} ({Total}).",
            invoice.Value.Id,
            notification.JobId,
            invoice.Value.Total);
    }
}
