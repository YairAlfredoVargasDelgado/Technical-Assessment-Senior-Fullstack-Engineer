using Hangfire;

using JobTracker.Api.Extensions;
using JobTracker.Common.Presentation.Endpoints;

using Scalar.AspNetCore;

using Serilog;

// -----------------------------------------------------------------------------
// Composition root.
//
// This file wires; it decides nothing. Every registration below is one call into
// a module or a concern that owns its own details, which is what keeps the file
// readable as the system grows — and what makes "what does this application
// consist of?" answerable by reading forty lines.
// -----------------------------------------------------------------------------

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((context, configuration) =>
    configuration.ReadFrom.Configuration(context.Configuration));

builder.Services
    .AddJobTrackerJson()
    .AddJobTrackerAuthentication(builder.Configuration)
    .AddJobTrackerInfrastructure(builder.Configuration)
    .AddJobTrackerApplication()
    .AddJobTrackerBackgroundJobs(builder.Configuration)
    .AddJobTrackerObservability(builder.Configuration)
    .AddJobTrackerRateLimiting()
    .AddJobTrackerCors(builder.Configuration);

builder.Services.AddOpenApi();

// Liveness and readiness are different questions. Liveness asks "is the process
// healthy?" — a failing answer should restart it. Readiness asks "can it serve
// traffic?" — a failing answer should take it out of the load balancer without
// restarting it. Sharing one endpoint means a database blip restarts every
// instance simultaneously.
builder.Services.AddHealthChecks();

// The development token issuer is registered by environment, not by a runtime
// `if` inside the endpoint. An endpoint that guards itself is one refactor away
// from being reachable in production.
if (!builder.Environment.IsProduction())
{
    builder.Services.AddEndpoints(typeof(Program).Assembly);
}

var app = builder.Build();

app.UseSerilogRequestLogging();

// Order is behaviour, not preference:
//   CORS before auth so a pre-flight OPTIONS is answered rather than challenged;
//   rate limiting after auth so the limiter can partition by tenant claim;
//   authentication before authorization, which is what it reads.
app.UseCors(JobTrackerServiceExtensions.CorsPolicyName);
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapHealthChecks("/health/live");
app.MapHealthChecks("/health/ready");

app.MapEndpoints();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();

    // The dashboard is unauthenticated, so it is mapped only outside production.
    app.UseHangfireDashboard("/hangfire");

    await app.ApplyMigrationsAsync();
}

app.ScheduleRecurringJobs();

await app.RunAsync();

/// <summary>
/// Exposed so integration tests can drive the real host through
/// <c>WebApplicationFactory&lt;Program&gt;</c> rather than a duplicate of this
/// wiring that would drift from it.
/// </summary>
public partial class Program;
