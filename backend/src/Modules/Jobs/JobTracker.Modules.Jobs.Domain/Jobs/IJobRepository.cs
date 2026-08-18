using System.Linq.Expressions;

namespace JobTracker.Modules.Jobs.Domain.Jobs;

/// <summary>
/// Persistence for the <see cref="Job"/> aggregate.
/// </summary>
/// <remarks>
/// <para>
/// <b>Declared in the Domain, implemented in Infrastructure.</b> That inversion
/// is the point: the application layer depends on this interface, and EF Core
/// depends on the interface too. Neither depends on the other, which is what
/// makes the domain testable with a hand-written fake and what would let the
/// storage engine change without the domain noticing.
/// </para>
/// <para>
/// It is the GoF <b>Repository</b> pattern in its narrow sense — a collection-like
/// facade over one aggregate root. There is deliberately no
/// <c>IJobPhotoRepository</c>: photos are reached through the job that owns
/// them, and a repository per entity would dissolve the aggregate boundary.
/// </para>
/// <para>
/// Note there is no <c>UpdateAsync</c>. Change tracking makes it unnecessary,
/// and offering it would suggest that saving is optional — the Unit of Work
/// decides when work is committed.
/// </para>
/// </remarks>
public interface IJobRepository
{
    /// <summary>
    /// Loads a job with its photos, tracked for modification.
    /// </summary>
    Task<Job?> GetByIdAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Registers a new job. Nothing is written until the Unit of Work commits.
    /// </summary>
    Task AddAsync(Job job, CancellationToken cancellationToken = default);

    /// <summary>
    /// Searches jobs, projecting each row into <typeparamref name="TProjection"/>.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The projection is a parameter rather than the method returning
    /// <see cref="Job"/> because the read side must not pay for the write side.
    /// Materialising aggregates to render a table loads every column, allocates
    /// the photo collections, and enrols each row in the change tracker — for
    /// data that will be serialised to JSON and discarded. Passing an expression
    /// lets the provider translate it into a <c>SELECT</c> of exactly the columns
    /// the caller asked for, with no tracking.
    /// </para>
    /// <para>
    /// <b>Trade-off.</b> <c>Expression&lt;Func&lt;,&gt;&gt;</c> in a domain
    /// interface does assume the implementation is expression-based. It is a
    /// narrower assumption than exposing <c>IQueryable&lt;Job&gt;</c> — the
    /// caller chooses a shape, not a query — and it is what keeps the read path
    /// efficient without a second repository abstraction that would need to be
    /// kept in step with this one.
    /// </para>
    /// <para>
    /// Returns up to <c>criteria.Limit + 1</c> rows. The surplus row is how the
    /// caller answers "is there another page?" without a second round trip.
    /// </para>
    /// </remarks>
    Task<IReadOnlyList<TProjection>> SearchAsync<TProjection>(
        JobSearchCriteria criteria,
        Expression<Func<Job, TProjection>> projection,
        CancellationToken cancellationToken = default);
}
