using JobTracker.Modules.Jobs.Domain.Jobs;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

using NpgsqlTypes;

namespace JobTracker.Modules.Jobs.Infrastructure.Database.Configurations;

/// <summary>
/// Maps the <see cref="Job"/> aggregate.
/// </summary>
/// <remarks>
/// Notice what is absent: no <c>HasColumnName</c> and no per-property
/// <c>HasConversion</c>. Naming comes from the snake_case convention and enum
/// storage from <c>ConfigureConventions</c>, so this file states only what is
/// genuinely specific to jobs — lengths, the owned address, the aggregate
/// boundary, and the indexes the query plans need.
/// </remarks>
internal sealed class JobConfiguration : IEntityTypeConfiguration<Job>
{
    public void Configure(EntityTypeBuilder<Job> builder)
    {
        builder.ToTable("jobs");

        builder.HasKey(job => job.Id);

        builder.Property(job => job.Title).HasMaxLength(Job.TitleMaxLength).IsRequired();
        builder.Property(job => job.Description).HasMaxLength(Job.DescriptionMaxLength);
        builder.Property(job => job.SignatureUrl).HasMaxLength(2048);
        builder.Property(job => job.CancellationReason).HasMaxLength(500);

        // The value object becomes columns on this table rather than a table of
        // its own. An address has no identity and is never queried independently,
        // so a separate table would add a join to every read to model a
        // relationship that does not exist in the domain.
        builder.ComplexProperty(job => job.Address, address =>
        {
            address.Property(value => value.Street).HasMaxLength(300).IsRequired();
            address.Property(value => value.City).HasMaxLength(150).IsRequired();
            address.Property(value => value.State).HasMaxLength(100).IsRequired();
            address.Property(value => value.ZipCode).HasMaxLength(20).IsRequired();
            address.Property(value => value.Latitude);
            address.Property(value => value.Longitude);
        });

        // The photo collection is reached through its backing field, not the
        // read-only property, so EF populates the aggregate without needing a
        // public mutator that would let callers bypass Job.AddPhoto.
        builder.HasMany(job => job.Photos)
            .WithOne()
            .HasForeignKey(photo => photo.JobId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.Metadata
            .FindNavigation(nameof(Job.Photos))!
            .SetPropertyAccessMode(PropertyAccessMode.Field);

        // Domain events are behaviour, not state. Persisting them would turn the
        // outbox into a second, competing record of what happened.
        builder.Ignore(job => job.DomainEvents);

        /* ------------------------------------------------------------------
         * Generated columns. Shadow properties: real columns, invisible to the
         * domain. See JobSearchColumns for why each exists.
         * ---------------------------------------------------------------- */

        builder.Property<NpgsqlTsVector>(JobSearchColumns.SearchVector)
            .HasColumnName("search_vector")
            .HasComputedColumnSql(
                "to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))",
                stored: true);

        builder.Property<DateTime>(JobSearchColumns.SortKey)
            .HasColumnName("sort_key")
            .HasComputedColumnSql("coalesce(scheduled_date_utc, 'infinity'::timestamptz)", stored: true);

        /* ------------------------------------------------------------------
         * Indexes. Every one of these is led by organization_id because every
         * query is tenant-scoped by the global filter — an index that does not
         * start with the tenant cannot serve those queries.
         * ---------------------------------------------------------------- */

        // GIN, not B-tree: a tsvector holds many lexemes per row, and only an
        // inverted index can answer "which rows contain this lexeme" without
        // reading them all.
        builder.HasIndex(JobSearchColumns.SearchVector)
            .HasDatabaseName("ix_jobs_search_vector")
            .HasMethod("GIN");

        // The keyset pagination index: tenant, then the ordering pair.
        builder.HasIndex(nameof(Job.OrganizationId), JobSearchColumns.SortKey, nameof(Job.Id))
            .HasDatabaseName("ix_jobs_organization_sort_key_id");

        builder.HasIndex(job => new { job.OrganizationId, job.Status, job.ScheduledDateUtc })
            .HasDatabaseName("ix_jobs_organization_status_scheduled_date");

        builder.HasIndex(job => new { job.OrganizationId, job.AssigneeId })
            .HasDatabaseName("ix_jobs_organization_assignee")
            .HasFilter("assignee_id IS NOT NULL");

        builder.HasIndex(job => new { job.OrganizationId, job.CustomerId })
            .HasDatabaseName("ix_jobs_organization_customer");
    }
}
