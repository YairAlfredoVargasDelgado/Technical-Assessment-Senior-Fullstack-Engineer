using JobTracker.Common.Domain.Results;

namespace JobTracker.Modules.Jobs.Domain.Jobs;

/// <summary>Every way an operation on a <see cref="Job"/> can fail.</summary>
public static class JobErrors
{
    public static readonly Error TitleRequired =
        Error.Validation("Job.TitleRequired", "Title is required.");

    public static readonly Error TitleTooLong =
        Error.Validation("Job.TitleTooLong", $"Title must be {Job.TitleMaxLength} characters or fewer.");

    public static readonly Error DescriptionTooLong =
        Error.Validation(
            "Job.DescriptionTooLong",
            $"Description must be {Job.DescriptionMaxLength} characters or fewer.");

    public static readonly Error CustomerRequired =
        Error.Validation("Job.CustomerRequired", "A job must belong to a customer.");

    public static readonly Error OrganizationRequired =
        Error.Validation("Job.OrganizationRequired", "A job must belong to an organization.");

    public static readonly Error AssigneeRequired =
        Error.Validation("Job.AssigneeRequired", "A scheduled job must have an assignee.");

    /// <summary>The invariant "a job cannot be scheduled in the past".</summary>
    public static readonly Error ScheduledInThePast =
        Error.Validation("Job.ScheduledInThePast", "A job cannot be scheduled in the past.");

    public static readonly Error SignatureRequired =
        Error.Validation("Job.SignatureRequired", "A completed job requires a customer signature.");

    public static readonly Error CancellationReasonRequired =
        Error.Validation("Job.CancellationReasonRequired", "A cancellation reason is required.");

    public static readonly Error PhotoUrlRequired =
        Error.Validation("Job.PhotoUrlRequired", "A photo URL is required.");

    public static readonly Error PhotoUrlInvalid =
        Error.Validation("Job.PhotoUrlInvalid", "A photo URL must be an absolute http(s) URI.");

    public static readonly Error PhotosOnlyWhileInProgress =
        Error.Conflict(
            "Job.PhotosOnlyWhileInProgress",
            "Photos can only be attached while the job is in progress.");

    public static Error NotFound(Guid jobId) =>
        Error.NotFound("Job.NotFound", $"No job with identifier '{jobId}' was found.");

    /// <summary>
    /// The single error raised for every rejected lifecycle transition.
    /// </summary>
    /// <remarks>
    /// One parameterised error rather than one constant per illegal pair. There
    /// are twenty illegal pairs; naming each would be twenty constants that say
    /// the same thing, and the set would have to be revisited every time a status
    /// is added. Clients branch on the stable <c>Code</c>; the human-readable
    /// description carries the specifics.
    /// </remarks>
    public static Error InvalidTransition(JobStatus from, JobStatus to) =>
        Error.Conflict(
            "Job.InvalidTransition",
            $"A job in state '{from}' cannot transition to '{to}'.");
}
