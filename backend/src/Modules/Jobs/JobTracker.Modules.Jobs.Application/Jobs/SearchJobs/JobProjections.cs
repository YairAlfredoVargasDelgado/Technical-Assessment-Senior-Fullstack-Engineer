using System.Linq.Expressions;

using JobTracker.Modules.Jobs.Domain.Jobs;

namespace JobTracker.Modules.Jobs.Application.Jobs.SearchJobs;

/// <summary>
/// The single definition of how a <see cref="Job"/> becomes a
/// <see cref="JobResponse"/>.
/// </summary>
/// <remarks>
/// <para>
/// Two call sites need this mapping and they need it in different forms: the
/// search handler passes an <see cref="Expression{TDelegate}"/> to EF Core, which
/// translates it into the <c>SELECT</c> list; the detail handler already holds a
/// materialised aggregate and needs a plain function.
/// </para>
/// <para>
/// Writing it twice — which is how this started — meant seventeen field
/// assignments duplicated verbatim, and a guarantee that adding a field to
/// <see cref="JobResponse"/> would update one caller and silently leave the other
/// returning stale shapes. Defining the expression once and compiling it for the
/// in-memory case gives both forms from one source.
/// </para>
/// <para>
/// <see cref="ToResponse"/> is <c>static readonly</c> so the expression tree is
/// allocated once and EF Core's compiled-query cache sees the same instance on
/// every request. <see cref="ToResponseFunc"/> pays the compilation cost once at
/// type initialisation rather than per call.
/// </para>
/// </remarks>
internal static class JobProjections
{
    /// <summary>The EF Core translatable form, used by the search query.</summary>
    public static readonly Expression<Func<Job, JobResponse>> ToResponse = job => new JobResponse(
        job.Id,
        job.Title,
        job.Description,
        job.Status,
        new JobAddressResponse(
            job.Address.Street,
            job.Address.City,
            job.Address.State,
            job.Address.ZipCode,
            job.Address.Latitude,
            job.Address.Longitude),
        job.ScheduledDateUtc,
        job.AssigneeId,
        job.CustomerId,
        // Translated into a correlated COUNT subquery rather than loading the
        // photo rows to count them client-side.
        job.Photos.Count,
        job.CreatedAtUtc,
        job.UpdatedAtUtc);

    /// <summary>The in-memory form, used when the aggregate is already loaded.</summary>
    public static readonly Func<Job, JobResponse> ToResponseFunc = ToResponse.Compile();
}
