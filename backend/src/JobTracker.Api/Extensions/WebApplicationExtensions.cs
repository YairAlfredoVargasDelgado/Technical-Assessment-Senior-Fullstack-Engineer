using Hangfire;

using JobTracker.Modules.Billing.Infrastructure.Database;
using JobTracker.Modules.Jobs.Infrastructure;
using JobTracker.Modules.Jobs.Infrastructure.Database;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

using JobTracker.Common.Infrastructure.Outbox;

namespace JobTracker.Api.Extensions;

internal static class WebApplicationExtensions
{
    /// <summary>
    /// Applies each module's migrations.
    /// </summary>
    /// <remarks>
    /// Development only. Migrating on startup in production means every instance
    /// races to alter the schema during a rolling deploy, and a failed migration
    /// takes the application down rather than failing a deployment step. There it
    /// belongs in the pipeline, before the new version starts.
    /// </remarks>
    public static async Task ApplyMigrationsAsync(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();

        await scope.ServiceProvider.GetRequiredService<JobsDbContext>().Database.MigrateAsync();
        await scope.ServiceProvider.GetRequiredService<BillingDbContext>().Database.MigrateAsync();
    }

    /// <summary>
    /// Schedules the outbox workers.
    /// </summary>
    /// <remarks>
    /// A recurring job with a stable identifier, so restarting the application
    /// replaces the schedule rather than accumulating a second copy of it.
    /// </remarks>
    public static WebApplication ScheduleRecurringJobs(this WebApplication app)
    {
        var options = app.Services.GetRequiredService<IOptions<OutboxOptions>>().Value;
        var recurringJobs = app.Services.GetRequiredService<IRecurringJobManager>();

        // Each module registers its own work. The host supplies the cadence and
        // knows nothing about what runs.
        recurringJobs.ScheduleJobsModuleRecurringJobs(options.PollingIntervalSeconds);

        return app;
    }
}
