using JobTracker.Common.Infrastructure.Outbox;
using JobTracker.Modules.Billing.Application.Abstractions;
using JobTracker.Modules.Billing.Domain.Invoices;
using JobTracker.Modules.Billing.Infrastructure.Database;
using JobTracker.Modules.Billing.Infrastructure.Invoices;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;

namespace JobTracker.Modules.Billing.Infrastructure;

/// <summary>Registers the Billing module.</summary>
public static class BillingModule
{
    public static IServiceCollection AddBillingModule(this IServiceCollection services, string connectionString)
    {
        services.AddDbContext<BillingDbContext>((serviceProvider, options) =>
            options
                .UseNpgsql(
                    connectionString,
                    npgsql => npgsql.MigrationsHistoryTable(
                        HistoryRepository.DefaultTableName,
                        BillingDbContext.Schema))
                .AddInterceptors(serviceProvider.GetRequiredService<InsertOutboxMessagesInterceptor>()));

        // Bound to the module-scoped contract, not to the shared IUnitOfWork.
        // Both modules' contexts implement that base interface, so a bare
        // registration would hand Billing handlers the Jobs context and their
        // SaveChangesAsync would commit nothing. See IBillingUnitOfWork.
        services.AddScoped<IBillingUnitOfWork>(
            serviceProvider => serviceProvider.GetRequiredService<BillingDbContext>());

        services.AddScoped<IInvoiceRepository, InvoiceRepository>();

        return services;
    }

    /// <summary>
    /// The Application assembly, for MediatR handler scanning.
    /// </summary>
    /// <remarks>
    /// Anchored to a public type from that assembly. The handlers themselves are
    /// <c>internal</c> — nothing outside their assembly should reference one
    /// directly — so they cannot serve as the marker.
    /// </remarks>
    public static System.Reflection.Assembly ApplicationAssembly { get; } =
        typeof(IBillingUnitOfWork).Assembly;
}
