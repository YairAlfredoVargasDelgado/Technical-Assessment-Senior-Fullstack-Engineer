using JobTracker.Common.Application.Abstractions.Authentication;
using JobTracker.Common.Infrastructure.Database;
using JobTracker.Modules.Jobs.Application.Abstractions;
using JobTracker.Common.Infrastructure.Outbox;
using JobTracker.Common.Infrastructure.Outbox.Configurations;
using JobTracker.Modules.Jobs.Domain.Jobs;

using Microsoft.EntityFrameworkCore;

namespace JobTracker.Modules.Jobs.Infrastructure.Database;

/// <summary>
/// The Jobs module's persistence context and its Unit of Work.
/// </summary>
/// <remarks>
/// <para>
/// <b>One context per module, one schema per context.</b> The Jobs module owns
/// the <c>jobs</c> schema and nothing else; Billing owns <c>billing</c>. That
/// boundary is what stops a modular monolith degrading into a shared database:
/// there is no way to write a join from Billing to a Jobs table, because Billing's
/// context has no idea those entities exist. Cross-module data flows through
/// integration events instead.
/// </para>
/// <para>
/// It implements <see cref="IUnitOfWork"/> so the application layer can commit
/// without knowing what is underneath — the interface lives in Application, the
/// implementation here, and the dependency points inward.
/// </para>
/// </remarks>
public sealed class JobsDbContext(DbContextOptions<JobsDbContext> options, ITenantContext tenantContext)
    : DbContext(options), IJobsUnitOfWork
{
    public const string Schema = "jobs";

    internal DbSet<Job> Jobs => Set<Job>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);

        modelBuilder.ApplyConfigurationsFromAssembly(typeof(JobsDbContext).Assembly);

        // Shape declared once in the shared kernel, placed in this module's schema.
        modelBuilder.ApplyConfiguration(new OutboxMessageConfiguration(Schema));
        modelBuilder.ApplyConfiguration(new OutboxMessageConsumerConfiguration(Schema));

        ApplyTenantFilter(modelBuilder);

        // Applied last: it rewrites the names the configurations above produced,
        // including the flattened column names of the owned Address type.
        modelBuilder.UseSnakeCaseNames();

        base.OnModelCreating(modelBuilder);
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // Enums as text, declared once for the whole model rather than
        // `.HasConversion<string>()` on each property that happens to be one.
        //
        // Storing the ordinal would mean that reordering `JobStatus` silently
        // rewrites the meaning of every existing row, and that every ad-hoc query
        // against this database is an exercise in remembering what `2` meant.
        configurationBuilder.Properties<JobStatus>()
            .HaveConversion<string>()
            .HaveMaxLength(30);

        base.ConfigureConventions(configurationBuilder);
    }

    /// <summary>
    /// Commits the transaction.
    /// </summary>
    /// <remarks>
    /// The outbox rows are added by <c>InsertOutboxMessagesInterceptor</c> during
    /// this call, before the SQL is dispatched, so they join the same transaction
    /// as the aggregate changes. Nothing about that is visible here, which is the
    /// point: no handler can forget to do it, because no handler does it.
    /// </remarks>
    public new Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        => base.SaveChangesAsync(cancellationToken);

    /// <summary>
    /// Scopes every query to the current tenant.
    /// </summary>
    /// <remarks>
    /// <para>
    /// This single filter is the multi-tenancy boundary for reads. The
    /// alternative — <c>.Where(job =&gt; job.OrganizationId == currentOrg)</c> in
    /// each query — holds only for as long as nobody forgets it once, and a
    /// forgotten filter is a silent cross-tenant data leak rather than a test
    /// failure.
    /// </para>
    /// <para>
    /// The <c>IsResolved</c> guard exists because background workers run outside
    /// any HTTP request and therefore outside any tenant. Without it the filter
    /// would compare against a throwing property and the outbox worker could
    /// never read a row.
    /// </para>
    /// </remarks>
    private void ApplyTenantFilter(ModelBuilder modelBuilder)
        => modelBuilder.Entity<Job>()
            .HasQueryFilter(job => !tenantContext.IsResolved || job.OrganizationId == tenantContext.OrganizationId);
}
