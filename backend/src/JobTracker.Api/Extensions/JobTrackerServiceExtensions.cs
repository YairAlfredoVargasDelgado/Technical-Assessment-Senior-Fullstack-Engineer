using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;

using Hangfire;
using Hangfire.PostgreSql;

using JobTracker.Api.Authentication;
using JobTracker.Api.Configuration;
using JobTracker.Common.Application.Abstractions.Authentication;
using JobTracker.Common.Application.Abstractions.Clock;
using JobTracker.Common.Application.Abstractions.Messaging;
using JobTracker.Common.Application.Abstractions.Notifications;
using JobTracker.Common.Application.Behaviors;
using JobTracker.Common.Infrastructure.Clock;
using JobTracker.Common.Infrastructure.EventBus;
using JobTracker.Common.Infrastructure.Notifications;
using JobTracker.Common.Infrastructure.Outbox;
using JobTracker.Common.Presentation.Endpoints;
using JobTracker.Modules.Billing.Infrastructure;
using JobTracker.Modules.Jobs.Infrastructure;
using JobTracker.Modules.Jobs.Presentation;

using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;

using Npgsql;

using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace JobTracker.Api.Extensions;

/// <summary>
/// The composition root, split by concern.
/// </summary>
/// <remarks>
/// One method per cross-cutting concern rather than two hundred lines in
/// <c>Program.cs</c>. Each is independently readable, and the module registrations
/// stay one line each — which is the property that makes a module feel like a unit
/// rather than a folder.
/// </remarks>
internal static class JobTrackerServiceExtensions
{
    public const string CorsPolicyName = "jobtracker-frontend";
    public const string RateLimitPolicyName = "sliding-window";

    public static IServiceCollection AddJobTrackerInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Database")
                               ?? throw new InvalidOperationException(
                                   "ConnectionStrings:Database is not configured.");

        // A shared data source rather than a connection string handed around:
        // it owns the connection pool, so the Dapper-based outbox worker and EF
        // Core draw from one pool instead of two competing ones.
        services.AddSingleton(_ => new NpgsqlDataSourceBuilder(connectionString).Build());

        services.AddSingleton<InsertOutboxMessagesInterceptor>();
        services.Configure<OutboxOptions>(configuration.GetSection(OutboxOptions.SectionName));

        services.AddSingleton<IDateTimeProvider, SystemDateTimeProvider>();
        services.AddSingleton<IEmailSender, LoggingEmailSender>();
        services.AddScoped<IEventBus, InProcessEventBus>();

        services.AddHttpContextAccessor();
        services.AddScoped<ITenantContext, HttpTenantContext>();

        // One line per module. Everything each needs is declared inside it.
        services.AddJobsModule(connectionString);
        services.AddBillingModule(connectionString);

        return services;
    }

    public static IServiceCollection AddJobTrackerApplication(this IServiceCollection services)
    {
        services.AddMediatR(configuration =>
        {
            configuration.RegisterServicesFromAssemblies(
                JobsModule.ApplicationAssembly,
                BillingModule.ApplicationAssembly);

            // Order is the execution order. Logging wraps validation so a request
            // rejected by a validator is still logged as having been handled;
            // reversing them would make invalid requests invisible in the logs.
            configuration.AddOpenBehavior(typeof(LoggingPipelineBehavior<,>));
            configuration.AddOpenBehavior(typeof(ValidationPipelineBehavior<,>));
        });

        services.AddEndpoints(JobsPresentation.Assembly);

        return services;
    }

    public static IServiceCollection AddJobTrackerAuthentication(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var options = configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
                      ?? throw new InvalidOperationException(
                          $"The '{JwtOptions.SectionName}' configuration section is missing.");

        services.AddSingleton(options);

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(jwt =>
            {
                jwt.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidateAudience = true,
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer = options.Issuer,
                    ValidAudience = options.Audience,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.SigningKey)),

                    // Default is five minutes of leeway, which quietly extends
                    // every token's life. Zero makes expiry mean expiry.
                    ClockSkew = TimeSpan.Zero,
                };
            });

        services.AddAuthorization();

        return services;
    }

    /// <summary>
    /// Sliding-window rate limiting.
    /// </summary>
    /// <remarks>
    /// <para>
    /// A fixed window allows a burst of 2N requests across a window boundary: N at
    /// the very end of one window and N at the start of the next. A sliding window
    /// divides the period into segments and expires them individually, so the
    /// count always covers a full period ending now — the boundary burst is not
    /// possible.
    /// </para>
    /// <para>
    /// Partitioned by tenant where one is known, falling back to remote IP for
    /// anonymous callers. Partitioning by IP alone would let a single organisation
    /// behind one NAT exhaust the limit for all of its users, and would let an
    /// attacker with many addresses bypass it.
    /// </para>
    /// </remarks>
    public static IServiceCollection AddJobTrackerRateLimiting(this IServiceCollection services)
        => services.AddRateLimiter(limiter =>
        {
            limiter.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

            limiter.AddPolicy(RateLimitPolicyName, httpContext =>
            {
                var partitionKey =
                    httpContext.User.FindFirst(JobTrackerClaimTypes.OrganizationId)?.Value
                    ?? httpContext.Connection.RemoteIpAddress?.ToString()
                    ?? "anonymous";

                return RateLimitPartition.GetSlidingWindowLimiter(
                    partitionKey,
                    _ => new SlidingWindowRateLimiterOptions
                    {
                        PermitLimit = 100,
                        Window = TimeSpan.FromMinutes(1),

                        // Six ten-second segments: the count always spans the last
                        // full minute, advancing in ten-second steps.
                        SegmentsPerWindow = 6,
                        QueueLimit = 0,
                        QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                    });
            });
        });

    public static IServiceCollection AddJobTrackerObservability(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var otlpEndpoint = configuration["OpenTelemetry:OtlpEndpoint"];

        services
            .AddOpenTelemetry()
            .ConfigureResource(resource => resource.AddService("jobtracker-api"))
            .WithTracing(tracing =>
            {
                tracing
                    .AddAspNetCoreInstrumentation(instrumentation =>
                        // Health probes fire every few seconds and would otherwise
                        // dominate the trace store while telling nobody anything.
                        instrumentation.Filter = context =>
                            !context.Request.Path.StartsWithSegments("/health"))
                    .AddHttpClientInstrumentation()
                    .AddEntityFrameworkCoreInstrumentation(instrumentation =>
                        instrumentation.SetDbStatementForText = true)
                    .AddNpgsql();

                if (!string.IsNullOrWhiteSpace(otlpEndpoint))
                {
                    tracing.AddOtlpExporter(exporter => exporter.Endpoint = new Uri(otlpEndpoint));
                }
            })
            .WithMetrics(metrics =>
            {
                metrics.AddAspNetCoreInstrumentation().AddHttpClientInstrumentation();

                if (!string.IsNullOrWhiteSpace(otlpEndpoint))
                {
                    metrics.AddOtlpExporter(exporter => exporter.Endpoint = new Uri(otlpEndpoint));
                }
            });

        return services;
    }

    public static IServiceCollection AddJobTrackerBackgroundJobs(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Database")!;

        services.AddHangfire(hangfire => hangfire
            .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
            .UseSimpleAssemblyNameTypeSerializer()
            .UseRecommendedSerializerSettings()
            .UsePostgreSqlStorage(postgres => postgres.UseNpgsqlConnection(connectionString)));

        services.AddHangfireServer();

        return services;
    }

    public static IServiceCollection AddJobTrackerJson(this IServiceCollection services)
        => services.ConfigureHttpJsonOptions(options =>
            // Enums over the wire as names, matching how they are stored. A client
            // receiving `2` has to maintain its own copy of the enum's ordering,
            // which breaks the moment a value is inserted.
            options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));

    public static IServiceCollection AddJobTrackerCors(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                             ?? ["http://localhost:3000"];

        return services.AddCors(cors => cors.AddPolicy(CorsPolicyName, policy => policy
            // An explicit origin list, never AllowAnyOrigin: credentials cannot be
            // sent to a wildcard origin, and a wildcard would let any site on the
            // internet call this API with the user's token.
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()));
    }
}
