using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

using JobTracker.Api.Authentication;
using JobTracker.Api.Configuration;
using JobTracker.Common.Presentation.Endpoints;

using Microsoft.IdentityModel.Tokens;

namespace JobTracker.Api.Endpoints;

/// <summary>
/// Issues a signed token for local development and end-to-end tests.
/// </summary>
/// <remarks>
/// <para>
/// <b>Registered only outside Production</b> — see <c>Program.cs</c>. This is not
/// an identity provider and must never behave like one: it authenticates nobody
/// and mints a token for whatever organisation is asked for.
/// </para>
/// <para>
/// It exists so the whole stack is runnable from <c>docker compose up</c> with no
/// external dependency, and so the Playwright suite can obtain a real token and
/// exercise the genuine authentication path rather than a bypass. A test that
/// runs against disabled auth proves nothing about the system that ships.
/// </para>
/// </remarks>
internal sealed class DevelopmentTokenEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
        => app.MapPost("/api/dev/token", IssueToken)
            .WithTags("Development")
            .WithSummary("Issues a development JWT. Not registered in Production.")
            .AllowAnonymous();

    private static IResult IssueToken(IssueTokenRequest request, JwtOptions options)
    {
        var organizationId = request.OrganizationId == Guid.Empty ? Guid.NewGuid() : request.OrganizationId;
        var userId = request.UserId == Guid.Empty ? Guid.NewGuid() : request.UserId;

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.SigningKey)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: options.Issuer,
            audience: options.Audience,
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
                new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
                new Claim(JobTrackerClaimTypes.OrganizationId, organizationId.ToString()),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            ],
            expires: DateTime.UtcNow.AddMinutes(options.TokenLifetimeMinutes),
            signingCredentials: credentials);

        return Results.Ok(new IssueTokenResponse(
            new JwtSecurityTokenHandler().WriteToken(token),
            organizationId,
            userId));
    }

    internal sealed record IssueTokenRequest(Guid OrganizationId, Guid UserId);

    internal sealed record IssueTokenResponse(string AccessToken, Guid OrganizationId, Guid UserId);
}
