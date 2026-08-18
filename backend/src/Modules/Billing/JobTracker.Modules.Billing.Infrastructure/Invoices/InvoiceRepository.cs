using JobTracker.Modules.Billing.Domain.Invoices;
using JobTracker.Modules.Billing.Infrastructure.Database;

using Microsoft.EntityFrameworkCore;

namespace JobTracker.Modules.Billing.Infrastructure.Invoices;

/// <summary>EF Core implementation of <see cref="IInvoiceRepository"/>.</summary>
/// <remarks>
/// Not split into partial classes, unlike <c>JobRepository</c>. It has two
/// methods and one concern; splitting it would be applying a technique because it
/// is available rather than because the class needs it.
/// </remarks>
internal sealed class InvoiceRepository(BillingDbContext context) : IInvoiceRepository
{
    public async Task AddAsync(Invoice invoice, CancellationToken cancellationToken = default)
        => await context.Invoices.AddAsync(invoice, cancellationToken);

    /// <remarks>
    /// <c>AnyAsync</c> rather than loading the row: the question is existence, and
    /// Postgres answers it from the unique index without touching the heap.
    /// </remarks>
    public Task<bool> ExistsWithIdempotencyKeyAsync(
        string idempotencyKey,
        CancellationToken cancellationToken = default)
        => context.Invoices
            .AsNoTracking()
            .AnyAsync(invoice => invoice.IdempotencyKey == idempotencyKey, cancellationToken);
}
