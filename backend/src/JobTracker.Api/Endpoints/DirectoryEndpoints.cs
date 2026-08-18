using System.Collections.Frozen;

using JobTracker.Common.Presentation.Endpoints;

namespace JobTracker.Api.Endpoints;

/// <summary>
/// Read-only lists of the customers and crew members a job can be assigned to.
/// </summary>
/// <remarks>
/// <para>
/// <b>Why this is not a module.</b> A job references a customer and an assignee by
/// identifier, but it does not own either of them — they belong to contexts this
/// codebase does not implement. Modelling them here as aggregates would invent a
/// lifecycle and invariants that do not exist: there is nothing to enforce, no
/// transition to guard, no rule that could be broken. That is over-engineering,
/// and it would put customer data inside the Jobs module, contradicting the
/// boundary the architecture tests enforce.
/// </para>
/// <para>
/// <b>Why it is on the server at all.</b> The alternative was a hard-coded list in
/// the frontend, which would put a second copy of these identifiers in a place the
/// API knows nothing about. Serving them makes the picker consume a real HTTP
/// contract, so replacing this stand-in with a genuine Contacts module later is a
/// change of implementation behind an unchanged endpoint — no client edit.
/// </para>
/// <para>
/// The data is fixed rather than stored: it is reference data for a demonstration,
/// and a table with no writer would be a migration to maintain for no gain.
/// </para>
/// </remarks>
internal sealed class DirectoryEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/directory")
            .WithTags("Directory")
            // Authorised like every other read: the picker is only reachable to a
            // caller the API already trusts, and the frontend fetches it with the
            // same token it uses for jobs.
            .RequireAuthorization();

        group.MapGet("/customers", () => Results.Ok(Customers))
            .WithSummary("Customers a job can be created for.");

        group.MapGet("/crew", () => Results.Ok(Crew))
            .WithSummary("Crew members a job can be assigned to.");
    }

    /// <summary>
    /// The first identifier in each list is the one the end-to-end suite creates
    /// jobs with. Changing it breaks those specs, deliberately: they select by
    /// value, so the option must exist.
    /// </summary>
    private static readonly FrozenSet<DirectoryEntry> Customers = new DirectoryEntry[]
    {
        new(Guid.Parse("33333333-3333-3333-3333-333333333333"), "Acme Property Group"),
        new(Guid.Parse("33333333-3333-3333-3333-333333333334"), "Bayside Apartments"),
        new(Guid.Parse("33333333-3333-3333-3333-333333333335"), "Cedar Ridge HOA"),
        new(Guid.Parse("33333333-3333-3333-3333-333333333336"), "Delaware Logistics"),
        new(Guid.Parse("33333333-3333-3333-3333-333333333337"), "Eastport School District"),
    }.ToFrozenSet();

    private static readonly FrozenSet<DirectoryEntry> Crew = new DirectoryEntry[]
    {
        new(Guid.Parse("44444444-4444-4444-4444-444444444444"), "Marcus Bell"),
        new(Guid.Parse("44444444-4444-4444-4444-444444444445"), "Dana Whitfield"),
        new(Guid.Parse("44444444-4444-4444-4444-444444444446"), "Priya Raman"),
        new(Guid.Parse("44444444-4444-4444-4444-444444444447"), "Tomás Ferreira"),
    }.ToFrozenSet();

    internal sealed record DirectoryEntry(Guid Id, string Name);
}
