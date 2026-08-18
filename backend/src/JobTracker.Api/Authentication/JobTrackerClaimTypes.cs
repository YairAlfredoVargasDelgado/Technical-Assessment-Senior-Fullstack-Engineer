namespace JobTracker.Api.Authentication;

/// <summary>
/// Custom claim names, declared once.
/// </summary>
/// <remarks>
/// The token issuer and the token reader must agree on these strings exactly. As
/// literals they would be two independent spellings of the same name, and a typo
/// in either produces an unauthenticated request with no error explaining why.
/// </remarks>
public static class JobTrackerClaimTypes
{
    /// <summary>The tenant. Every request is scoped by it.</summary>
    public const string OrganizationId = "org_id";
}
