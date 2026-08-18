namespace JobTracker.Common.Application.Abstractions.Data;

/// <summary>
/// One business transaction, committed as a single atomic unit.
/// </summary>
/// <remarks>
/// <para>
/// The Unit of Work is what lets a repository stay free of persistence timing.
/// <c>IJobRepository.AddAsync</c> records an intent; nothing reaches the
/// database until the handler calls <see cref="SaveChangesAsync"/>. A handler
/// that mutates two aggregates therefore commits both or neither, without any
/// explicit transaction handling in the handler itself.
/// </para>
/// <para>
/// This is also where the outbox is written. Domain events raised during the
/// transaction are converted to outbox rows and inserted <i>in the same
/// transaction</i> as the state change, which is what removes the dual-write
/// problem: there is no window in which the job is completed but the invoice
/// request was lost.
/// </para>
/// <para>
/// It is declared in the Application layer, not Infrastructure, because it is
/// the Application layer that needs it. The EF Core implementation depends on
/// this interface, never the reverse — Dependency Inversion.
/// </para>
/// </remarks>
public interface IUnitOfWork
{
    /// <returns>The number of state entries written.</returns>
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
