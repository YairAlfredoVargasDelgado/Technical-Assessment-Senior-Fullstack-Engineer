using Microsoft.AspNetCore.Routing;

namespace JobTracker.Common.Presentation.Endpoints;

/// <summary>
/// A group of related HTTP endpoints, registered by discovery rather than by
/// being listed in the composition root.
/// </summary>
/// <remarks>
/// <para>
/// Without this, every new route means editing <c>Program.cs</c> — a file every
/// module touches, which turns into a merge-conflict magnet and a list nobody
/// keeps tidy. Here a module ships its endpoints and the host finds them.
/// </para>
/// <para>
/// Open/Closed at the transport layer: the host is closed to modification and the
/// API is open to extension.
/// </para>
/// </remarks>
public interface IEndpoint
{
    void MapEndpoint(IEndpointRouteBuilder app);
}
