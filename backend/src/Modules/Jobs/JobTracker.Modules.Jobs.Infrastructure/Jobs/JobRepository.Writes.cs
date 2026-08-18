using JobTracker.Modules.Jobs.Domain.Jobs;

using Microsoft.EntityFrameworkCore;

namespace JobTracker.Modules.Jobs.Infrastructure.Jobs;

/// <summary>The write side: loading and adding tracked aggregates.</summary>
internal sealed partial class JobRepository
{
    /// <summary>
    /// Loads a job with its photos, tracked.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Tracked on purpose. This is the path a command takes, and a command
    /// mutates the aggregate; without tracking, <c>SaveChangesAsync</c> would
    /// find nothing to write and the operation would silently do nothing.
    /// </para>
    /// <para>
    /// <c>Include(Photos)</c> loads the whole aggregate, because an invariant may
    /// span it — <c>AddPhoto</c> needs the existing collection. Loading a partial
    /// aggregate and then enforcing rules over it is how consistency boundaries
    /// get violated quietly.
    /// </para>
    /// <para>
    /// The tenant filter is applied automatically by the context, so a job
    /// belonging to another organisation is simply not found — the same answer a
    /// non-existent id gets, which is also the right answer to give an attacker
    /// probing for identifiers.
    /// </para>
    /// </remarks>
    public async Task<Job?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default)
        => await context.Jobs
            .Include(job => job.Photos)
            .FirstOrDefaultAsync(job => job.Id == id, cancellationToken);

    /// <summary>
    /// Registers a new job with the change tracker.
    /// </summary>
    /// <remarks>
    /// Nothing is written here. The Unit of Work decides when the transaction
    /// commits, which is what allows a handler to touch several aggregates and
    /// still get all-or-nothing semantics.
    /// </remarks>
    public async Task AddAsync(Job job, CancellationToken cancellationToken = default)
        => await context.Jobs.AddAsync(job, cancellationToken);
}
