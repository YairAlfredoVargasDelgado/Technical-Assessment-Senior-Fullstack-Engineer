using JobTracker.Modules.Billing.Domain.Invoices;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace JobTracker.Modules.Billing.Infrastructure.Database.Configurations;

internal sealed class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.ToTable("invoices");

        builder.HasKey(invoice => invoice.Id);

        builder.ComplexProperty(invoice => invoice.Total, total =>
        {
            // 19,4 rather than the default 18,2: four decimal places leave room
            // for line-level rates and tax fractions to be stored without a
            // rounding step that would make the total not equal the sum of its
            // parts.
            total.Property(money => money.Amount).HasPrecision(19, 4).IsRequired();
            total.Property(money => money.Currency).HasMaxLength(3).IsRequired();
        });

        builder.Property(invoice => invoice.IdempotencyKey).HasMaxLength(200).IsRequired();

        // THE guarantee. Not an ordinary index — a unique constraint, so a second
        // delivery of the same completion is rejected by Postgres rather than
        // merely unlikely to race through the handler's existence check.
        builder.HasIndex(invoice => invoice.IdempotencyKey)
            .IsUnique()
            .HasDatabaseName("ux_invoices_idempotency_key");

        builder.HasIndex(invoice => new { invoice.OrganizationId, invoice.IssuedAtUtc })
            .HasDatabaseName("ix_invoices_organization_issued_at");

        builder.HasIndex(invoice => invoice.JobId).HasDatabaseName("ix_invoices_job_id");

        builder.Ignore(invoice => invoice.DomainEvents);
    }
}
