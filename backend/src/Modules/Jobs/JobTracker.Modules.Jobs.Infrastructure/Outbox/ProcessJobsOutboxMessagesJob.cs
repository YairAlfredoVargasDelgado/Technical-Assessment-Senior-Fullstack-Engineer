using JobTracker.Common.Infrastructure.Outbox;
using JobTracker.Modules.Jobs.Infrastructure.Database;

using Hangfire;

using MediatR;

using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

using Npgsql;

namespace JobTracker.Modules.Jobs.Infrastructure.Outbox;

/// <summary>
/// Drains the Jobs module's outbox.
/// </summary>
/// <remarks>
/// <para>
/// The entire module-specific part of the outbox worker: a schema name. Every
/// other decision — claiming with <c>SKIP LOCKED</c>, per-handler idempotency,
/// per-message error isolation — lives in the shared base and is therefore
/// identical in every module and fixed in one place.
/// </para>
/// <para>
/// <c>DisableConcurrentExecution</c> is belt-and-braces. <c>SKIP LOCKED</c>
/// already makes concurrent runs correct; the attribute keeps a slow batch from
/// accumulating overlapping executions behind it and turning a transient slowdown
/// into connection-pool exhaustion.
/// </para>
/// </remarks>
[DisableConcurrentExecution(timeoutInSeconds: 60)]
internal sealed class ProcessJobsOutboxMessagesJob(
    NpgsqlDataSource dataSource,
    IPublisher publisher,
    IOptions<OutboxOptions> options,
    ILogger<ProcessJobsOutboxMessagesJob> logger)
    : ProcessOutboxMessagesJobBase(dataSource, publisher, options, logger)
{
    /// <summary>The recurring-job identifier Hangfire schedules this under.</summary>
    public const string RecurringJobId = "jobs-outbox-processor";

    protected override string Schema => JobsDbContext.Schema;
}
