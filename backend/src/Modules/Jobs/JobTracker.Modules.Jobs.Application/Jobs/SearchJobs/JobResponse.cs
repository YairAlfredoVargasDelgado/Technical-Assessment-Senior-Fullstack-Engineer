using JobTracker.Modules.Jobs.Domain.Jobs;

namespace JobTracker.Modules.Jobs.Application.Jobs.SearchJobs;

/// <summary>
/// The read model for a job row.
/// </summary>
/// <remarks>
/// <para>
/// A separate type from <see cref="Job"/>, and that separation is the read side
/// of CQRS in practice. The aggregate is shaped for enforcing invariants; this is
/// shaped for a table on a screen. Serialising the aggregate instead would publish
/// its internals as an API contract, so every refactor of the domain would become
/// a breaking change for the client.
/// </para>
/// <para>
/// <see cref="Address"/> is nested rather than flattened into six sibling
/// properties. It mirrors the value object it comes from, so a consumer can pass
/// the whole address around as one thing — and it means adding a field to the
/// address does not widen the top-level shape of every job payload.
/// </para>
/// <para>
/// <see cref="PhotoCount"/> rather than the photos themselves: the list view shows
/// a count, and shipping every photo URL for every row would multiply the payload
/// for data nothing renders.
/// </para>
/// </remarks>
public sealed record JobResponse(
    Guid Id,
    string Title,
    string? Description,
    JobStatus Status,
    JobAddressResponse Address,
    DateTime? ScheduledDateUtc,
    Guid? AssigneeId,
    Guid CustomerId,
    int PhotoCount,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);

/// <summary>The address of a job, as the API returns it.</summary>
public sealed record JobAddressResponse(
    string Street,
    string City,
    string State,
    string ZipCode,
    double? Latitude,
    double? Longitude);
