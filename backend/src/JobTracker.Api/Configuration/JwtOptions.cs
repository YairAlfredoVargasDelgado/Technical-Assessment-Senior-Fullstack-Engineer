namespace JobTracker.Api.Configuration;

/// <summary>Token validation settings.</summary>
/// <remarks>
/// <see cref="SigningKey"/> is a symmetric secret, which is appropriate only
/// because this service both issues and validates the token in a development
/// setup. A real deployment validates against an identity provider's public keys
/// fetched from its JWKS endpoint, at which point this property disappears rather
/// than being moved to a secret store.
/// </remarks>
public sealed class JwtOptions
{
    public const string SectionName = "Authentication";

    public required string Issuer { get; init; }

    public required string Audience { get; init; }

    public required string SigningKey { get; init; }

    public int TokenLifetimeMinutes { get; init; } = 60;
}
