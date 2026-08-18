using JobTracker.Common.Application.Abstractions.Data;

namespace JobTracker.Modules.Billing.Application.Abstractions;

/// <summary>
/// The Billing module's transaction boundary.
/// </summary>
/// <remarks>
/// See <c>IJobsUnitOfWork</c> for why each module declares its own rather than
/// sharing <see cref="IUnitOfWork"/> directly.
/// </remarks>
public interface IBillingUnitOfWork : IUnitOfWork;
