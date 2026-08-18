using JobTracker.Common.Infrastructure.Database;
using JobTracker.Modules.Billing.Application.Abstractions;
using JobTracker.Common.Infrastructure.Outbox;
using JobTracker.Common.Infrastructure.Outbox.Configurations;
using JobTracker.Modules.Billing.Domain.Invoices;

using Microsoft.EntityFrameworkCore;

namespace JobTracker.Modules.Billing.Infrastructure.Database;

/// <summary>
/// The Billing module's persistence context.
/// </summary>
/// <remarks>
/// Its own schema, its own migration history, its own outbox. It has no
/// <c>DbSet&lt;Job&gt;</c> and no mapping for anything the Jobs module owns, so a
/// cross-module join is not something to be avoided by discipline — it is not
/// expressible.
/// </remarks>
public sealed class BillingDbContext(DbContextOptions<BillingDbContext> options)
    : DbContext(options), IBillingUnitOfWork
{
    public const string Schema = "billing";

    internal DbSet<Invoice> Invoices => Set<Invoice>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.ApplyConfigurationsFromAssembly(typeof(BillingDbContext).Assembly);

        modelBuilder.ApplyConfiguration(new OutboxMessageConfiguration(Schema));
        modelBuilder.ApplyConfiguration(new OutboxMessageConsumerConfiguration(Schema));

        modelBuilder.UseSnakeCaseNames();

        base.OnModelCreating(modelBuilder);
    }

    public new Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        => base.SaveChangesAsync(cancellationToken);
}
