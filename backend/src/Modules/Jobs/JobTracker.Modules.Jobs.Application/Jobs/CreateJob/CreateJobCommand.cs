using JobTracker.Common.Application.Abstractions.Messaging;

namespace JobTracker.Modules.Jobs.Application.Jobs.CreateJob;

/// <summary>
/// Creates a job, either as a draft or already booked in.
/// </summary>
/// <remarks>
/// <para>
/// <b>There is no OrganizationId.</b> The tenant is read from the authenticated
/// principal via <c>ITenantContext</c>, never from the request body. Accepting it
/// as input would let any caller write a job into another company's data by
/// editing one field — the most direct possible multi-tenancy breach, and one
/// that no amount of validation on the other fields would catch.
/// </para>
/// <para>
/// <see cref="ScheduledDateUtc"/> and <see cref="AssigneeId"/> are optional and
/// travel together: supplying both books the job in immediately, supplying
/// neither leaves it as a draft. Supplying exactly one is rejected by the
/// validator rather than silently ignored.
/// </para>
/// </remarks>
public sealed record CreateJobCommand(
    string Title,
    string? Description,
    string Street,
    string City,
    string State,
    string ZipCode,
    double? Latitude,
    double? Longitude,
    Guid CustomerId,
    DateTime? ScheduledDateUtc,
    Guid? AssigneeId) : ICommand<Guid>;
