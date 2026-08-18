using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace JobTracker.Common.Infrastructure.Outbox.Configurations;

/// <summary>
/// Maps the outbox tables into whichever schema the owning module uses.
/// </summary>
/// <remarks>
/// Every module has its own outbox, in its own schema, so that a module's
/// messages live and are migrated with the module. The <i>shape</i> of those
/// tables is identical, so it is declared once here and applied by each
/// module's <c>DbContext</c> with its own schema name — rather than copied into
/// each module, where the copies would slowly diverge.
/// </remarks>
public sealed class OutboxMessageConfiguration(string schema) : IEntityTypeConfiguration<OutboxMessage>
{
    public void Configure(EntityTypeBuilder<OutboxMessage> builder)
    {
        builder.ToTable("outbox_messages", schema);

        builder.HasKey(message => message.Id);

        builder.Property(message => message.Type).HasMaxLength(500).IsRequired();

        // jsonb rather than text: it is queryable and validated by Postgres, which
        // turns a malformed payload into an insert failure instead of a
        // deserialisation failure discovered minutes later in the worker.
        builder.Property(message => message.Content).HasColumnType("jsonb").IsRequired();

        builder.Property(message => message.OccurredOnUtc).IsRequired();

        // The worker's hot path is "unprocessed, oldest first". A partial index
        // covers only pending rows, so it stays small no matter how large the
        // processed history grows — the table is append-mostly and the index
        // would otherwise grow without bound.
        builder.HasIndex(message => message.OccurredOnUtc)
            .HasDatabaseName("ix_outbox_messages_unprocessed")
            .HasFilter("processed_on_utc IS NULL");
    }
}
