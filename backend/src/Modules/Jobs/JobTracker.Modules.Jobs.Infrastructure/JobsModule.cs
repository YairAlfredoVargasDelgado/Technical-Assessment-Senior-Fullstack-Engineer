using FluentValidation;

using Hangfire;

using JobTracker.Common.Infrastructure.Outbox;
using JobTracker.Modules.Jobs.Application.Abstractions;
using JobTracker.Modules.Jobs.Application.Jobs.CreateJob;
using JobTracker.Modules.Jobs.Domain.Jobs;
using JobTracker.Modules.Jobs.Infrastructure.Database;
using JobTracker.Modules.Jobs.Infrastructure.Jobs;
using JobTracker.Modules.Jobs.Infrastructure.Outbox;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;

namespace JobTracker.Modules.Jobs.Infrastructure;

/// <summary>
/// Everything the Jobs module needs from the container, in one place.
/// </summary>
/// <remarks>
/// <para>
/// The composition root calls <c>AddJobsModule</c> and knows nothing further
/// about Jobs. That single entry point is what makes the module a unit that can
/// be reasoned about — and eventually extracted — rather than a set of
/// registrations scattered through <c>Program.cs</c> alongside every other
/// module's.
/// </para>
/// <para>
/// It is also where the layering is finally realised: this is the only assembly
/// that can see both <c>IJobRepository</c> (Domain) and <c>JobRepository</c>
/// (Infrastructure), so it is the only place the two can be introduced to each
/// other.
/// </para>
/// </remarks>
public static class JobsModule
{
    public static IServiceCollection AddJobsModule(this IServiceCollection services, string connectionString)
    {
        services.AddDbContext<JobsDbContext>((serviceProvider, options) =>
            options
                .UseNpgsql(
                    connectionString,
                    npgsql => npgsql.MigrationsHistoryTable(
                        // Each module migrates independently, so each needs its
                        // own history table inside its own schema. A shared
                        // history table would make the modules' migrations a
                        // single ordered sequence they would have to coordinate.
                        HistoryRepository.DefaultTableName,
                        JobsDbContext.Schema))
                .AddInterceptors(serviceProvider.GetRequiredService<InsertOutboxMessagesInterceptor>())

                // JobPhoto has no query filter of its own while its principal
                // Job does. That is correct here — photos are unreachable except
                // through the job that owns them, so the job's filter already
                // governs them — but EF cannot know that and warns. Suppressed
                // deliberately and narrowly rather than left to add noise that
                // trains reviewers to ignore warnings.
                .ConfigureWarnings(warnings => warnings.Ignore(
                    CoreEventId.PossibleIncorrectRequiredNavigationWithQueryFilterInteractionWarning)));

        // The same instance serves as the module's Unit of Work: registering a
        // second DbContext would give handlers a different change tracker from
        // their repository, and SaveChangesAsync would commit nothing.
        //
        // Bound to IJobsUnitOfWork rather than the shared IUnitOfWork so that
        // Billing's context cannot be resolved in its place. See IJobsUnitOfWork.
        services.AddScoped<IJobsUnitOfWork>(serviceProvider => serviceProvider.GetRequiredService<JobsDbContext>());

        services.AddScoped<IJobRepository, JobRepository>();

        services.AddScoped<ProcessJobsOutboxMessagesJob>();

        // Scanned from the Application assembly so adding a use case needs no
        // registration. The marker type is a real class from that assembly, which
        // is what makes this a compile-time reference rather than a string.
        services.AddValidatorsFromAssemblyContaining<CreateJobCommand>(includeInternalTypes: true);

        return services;
    }

    /// <summary>
    /// Registers this module's recurring background work.
    /// </summary>
    /// <remarks>
    /// The module schedules its own jobs, so <c>ProcessJobsOutboxMessagesJob</c>
    /// stays <c>internal</c> and the host never learns that the Jobs outbox is
    /// drained by a Hangfire recurring job rather than by some other mechanism.
    /// A stable identifier means restarting the application replaces the schedule
    /// instead of accumulating a second copy of it.
    /// </remarks>
    public static void ScheduleJobsModuleRecurringJobs(
        this IRecurringJobManager recurringJobs,
        int pollingIntervalSeconds)
        => recurringJobs.AddOrUpdate<ProcessJobsOutboxMessagesJob>(
            ProcessJobsOutboxMessagesJob.RecurringJobId,
            job => job.ExecuteAsync(CancellationToken.None),
            $"*/{Math.Max(pollingIntervalSeconds, 1)} * * * * *");

    /// <summary>
    /// The Application assembly, for MediatR handler scanning by the host.
    /// </summary>
    /// <remarks>
    /// Exposed as a property so the composition root never needs a magic string
    /// or a second reference to the Application project just to name it.
    /// </remarks>
    public static System.Reflection.Assembly ApplicationAssembly { get; } =
        typeof(CreateJobCommand).Assembly;
}
