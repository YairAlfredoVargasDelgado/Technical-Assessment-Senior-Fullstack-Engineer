using JobTracker.Modules.Jobs.Domain.Jobs;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace JobTracker.Modules.Jobs.Infrastructure.Database.Configurations;

/// <summary>
/// Maps <see cref="JobPhoto"/>, an entity inside the Job aggregate.
/// </summary>
/// <remarks>
/// It gets a table of its own because it has identity and there are many per
/// job — but it gets no <c>DbSet</c>, so it can only be reached by loading the
/// job that owns it. The aggregate boundary is preserved in the persistence layer
/// as well as in the domain.
/// </remarks>
internal sealed class JobPhotoConfiguration : IEntityTypeConfiguration<JobPhoto>
{
    public void Configure(EntityTypeBuilder<JobPhoto> builder)
    {
        builder.ToTable("job_photos");

        builder.HasKey(photo => photo.Id);

        builder.Property(photo => photo.Url).HasMaxLength(2048).IsRequired();
        builder.Property(photo => photo.Caption).HasMaxLength(500);
        builder.Property(photo => photo.CapturedAtUtc).IsRequired();

        // Serves both the aggregate load (Include) and the correlated COUNT in
        // the search projection.
        builder.HasIndex(photo => photo.JobId).HasDatabaseName("ix_job_photos_job_id");
    }
}
