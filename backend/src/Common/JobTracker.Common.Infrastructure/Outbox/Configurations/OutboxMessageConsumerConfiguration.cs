using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace JobTracker.Common.Infrastructure.Outbox.Configurations;

/// <summary>Maps the per-handler processing ledger.</summary>
public sealed class OutboxMessageConsumerConfiguration(string schema)
    : IEntityTypeConfiguration<OutboxMessageConsumer>
{
    public void Configure(EntityTypeBuilder<OutboxMessageConsumer> builder)
    {
        builder.ToTable("outbox_message_consumers", schema);

        // The composite key is the idempotency check. Making it the primary key
        // rather than a plain index means a concurrent double-insert is rejected
        // by the database, not merely unlikely.
        builder.HasKey(consumer => new { consumer.OutboxMessageId, consumer.Name });

        builder.Property(consumer => consumer.Name).HasMaxLength(500);
    }
}
