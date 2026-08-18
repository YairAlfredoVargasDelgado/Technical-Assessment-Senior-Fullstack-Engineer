namespace JobTracker.Common.Application.Abstractions.Authentication;

/// <summary>
/// The organisation whose data the current request is allowed to touch.
/// </summary>
/// <remarks>
/// <para>
/// Multi-tenancy is enforced in exactly two places, and this interface feeds
/// both: an EF Core global query filter (so every read is scoped without a
/// single <c>Where</c> clause in any repository) and aggregate creation (so a
/// new row cannot be written into another tenant's data).
/// </para>
/// <para>
/// Spreading <c>.Where(x =&gt; x.OrganizationId == currentOrg)</c> across query
/// handlers instead would mean the security boundary holds only as long as
/// nobody forgets it once — and a forgotten filter is a silent cross-tenant data
/// leak, not a test failure.
/// </para>
/// </remarks>
public interface ITenantContext
{
    /// <summary>The current organisation.</summary>
    /// <exception cref="InvalidOperationException">
    /// Thrown when no tenant is resolvable. Failing loudly is deliberate:
    /// defaulting to <see cref="Guid.Empty"/> would silently widen a query
    /// filter to "rows belonging to nobody" and hide the misconfiguration.
    /// </exception>
    Guid OrganizationId { get; }

    /// <summary>The authenticated user, when there is one.</summary>
    Guid? UserId { get; }

    /// <summary>
    /// Whether a tenant is resolvable at all.
    /// </summary>
    /// <remarks>
    /// Background jobs run outside any HTTP request and therefore outside any
    /// tenant. They query with the filter disabled and scope explicitly instead;
    /// this flag is how the persistence layer tells the two situations apart.
    /// </remarks>
    bool IsResolved { get; }
}
