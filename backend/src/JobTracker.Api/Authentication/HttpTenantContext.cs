using System.Security.Claims;

using JobTracker.Common.Application.Abstractions.Authentication;

using Microsoft.AspNetCore.Http;

namespace JobTracker.Api.Authentication;

/// <summary>
/// Resolves the tenant from the authenticated principal.
/// </summary>
/// <remarks>
/// <para>
/// <b>The claim, never the request.</b> The organisation is read from a signed
/// token, so a caller cannot select which tenant's data to touch by editing a
/// header or a body field. This class is the only place in the system that
/// decides what "the current tenant" means, and everything else — the EF global
/// query filter, aggregate creation — reads it from here.
/// </para>
/// <para>
/// It lives in the API project because it is the only component that knows about
/// HTTP. The modules depend on <see cref="ITenantContext"/>, which knows nothing
/// about requests, so a background worker or an integration test supplies its own
/// implementation without a fake HTTP context.
/// </para>
/// </remarks>
internal sealed class HttpTenantContext(IHttpContextAccessor httpContextAccessor) : ITenantContext
{
    public Guid OrganizationId =>
        TryGetOrganizationId() ?? throw new InvalidOperationException(
            "No organization could be resolved for the current request. "
            + "This indicates an authenticated endpoint was reached without the "
            + $"'{JobTrackerClaimTypes.OrganizationId}' claim, or that a background "
            + "job resolved ITenantContext without checking IsResolved first.");

    public Guid? UserId =>
        Guid.TryParse(FindClaim(ClaimTypes.NameIdentifier), out var userId) ? userId : null;

    /// <summary>
    /// Whether a tenant exists for the current execution context.
    /// </summary>
    /// <remarks>
    /// False inside Hangfire workers, which run outside any request. The query
    /// filter consults this so those workers can read the outbox instead of
    /// hitting the exception above on their first query.
    /// </remarks>
    public bool IsResolved => TryGetOrganizationId() is not null;

    private Guid? TryGetOrganizationId()
        => Guid.TryParse(FindClaim(JobTrackerClaimTypes.OrganizationId), out var organizationId)
            ? organizationId
            : null;

    private string? FindClaim(string claimType)
        => httpContextAccessor.HttpContext?.User.FindFirstValue(claimType);
}
