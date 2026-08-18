using System.Reflection;

namespace JobTracker.Modules.Jobs.Presentation;

/// <summary>
/// The Jobs module's presentation assembly, for endpoint discovery.
/// </summary>
/// <remarks>
/// The host needs the assembly, not the endpoint classes. Publishing this marker
/// lets every <c>IEndpoint</c> stay <c>internal</c> — the composition root
/// registers them by discovery and can never reference one directly, so a route's
/// implementation remains a module-private detail.
/// </remarks>
public static class JobsPresentation
{
    public static Assembly Assembly { get; } = typeof(JobsPresentation).Assembly;
}
