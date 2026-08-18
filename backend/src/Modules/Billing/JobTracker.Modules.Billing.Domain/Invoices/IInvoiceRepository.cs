namespace JobTracker.Modules.Billing.Domain.Invoices;

/// <summary>Persistence for the <see cref="Invoice"/> aggregate.</summary>
public interface IInvoiceRepository
{
    Task AddAsync(Invoice invoice, CancellationToken cancellationToken = default);

    /// <summary>
    /// Whether an invoice already exists for this business fact.
    /// </summary>
    /// <remarks>
    /// A fast path, not the guarantee. It lets a redelivered event be skipped
    /// without provoking a constraint violation and the log noise that comes with
    /// it. The guarantee is the unique index on the column, because this check and
    /// the subsequent insert are not atomic and two concurrent deliveries can both
    /// pass it.
    /// </remarks>
    Task<bool> ExistsWithIdempotencyKeyAsync(string idempotencyKey, CancellationToken cancellationToken = default);
}
