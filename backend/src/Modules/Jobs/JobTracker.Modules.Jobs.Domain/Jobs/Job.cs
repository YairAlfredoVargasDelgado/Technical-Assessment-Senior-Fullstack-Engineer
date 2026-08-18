using System.Collections.Frozen;

using JobTracker.Common.Domain.Abstractions;
using JobTracker.Common.Domain.Results;
using JobTracker.Modules.Jobs.Domain.Jobs.Events;

namespace JobTracker.Modules.Jobs.Domain.Jobs;

/// <summary>
/// A unit of roofing work: the aggregate root of the Jobs module.
/// </summary>
/// <remarks>
/// <para>
/// <b>Not an anemic model.</b> Every setter is private and every state change
/// goes through a method that names a business action — <see cref="Schedule"/>,
/// <see cref="Start"/>, <see cref="Complete"/>, <see cref="Cancel"/> — and
/// returns a <c>Result</c>. There is no code path that produces a job in an
/// inconsistent state, because there is no code path that writes to a job
/// without going through its rules.
/// </para>
/// <para>
/// <b>Information Expert (GRASP).</b> The job holds its own status and dates, so
/// the job is what decides whether it may be started. Moving that decision into
/// a handler or a "JobService" would mean exposing the status publicly and then
/// trusting every caller to consult it — which is how the same check ends up
/// written in four places and disagrees with itself in one of them.
/// </para>
/// <para>
/// <b>The transition table.</b> Two of the three stated invariants — "cannot
/// leave Completed or Cancelled" and "only Scheduled jobs may start" — are the
/// same rule about which moves are legal. They are expressed once, as data, in
/// <see cref="AllowedTransitions"/>, and enforced once in
/// <see cref="EnsureCanTransitionTo"/>. A per-method <c>if (Status != ...)</c>
/// ladder would restate that rule five times, and the fifth would be the one
/// that is wrong.
/// </para>
/// </remarks>
public sealed class Job : AggregateRoot
{
    public const int TitleMaxLength = 200;
    public const int DescriptionMaxLength = 4000;

    /// <summary>
    /// The legal moves, as data.
    /// </summary>
    /// <remarks>
    /// The terminal states map to empty sets, which is how "cannot transition
    /// out of Completed or Cancelled" is expressed without a special case.
    /// <c>FrozenDictionary</c> because this is built once and read on every
    /// state change — it trades a slower construction for faster lookups.
    /// </remarks>
    private static readonly FrozenDictionary<JobStatus, FrozenSet<JobStatus>> AllowedTransitions =
        new Dictionary<JobStatus, FrozenSet<JobStatus>>
        {
            [JobStatus.Draft] = new[] { JobStatus.Scheduled, JobStatus.Cancelled }.ToFrozenSet(),
            [JobStatus.Scheduled] = new[] { JobStatus.InProgress, JobStatus.Cancelled }.ToFrozenSet(),
            [JobStatus.InProgress] = new[] { JobStatus.Completed, JobStatus.Cancelled }.ToFrozenSet(),
            [JobStatus.Completed] = FrozenSet<JobStatus>.Empty,
            [JobStatus.Cancelled] = FrozenSet<JobStatus>.Empty,
        }.ToFrozenDictionary();

    private readonly List<JobPhoto> _photos = [];

    private Job(
        Guid id,
        string title,
        string? description,
        Address address,
        Guid customerId,
        Guid organizationId,
        JobStatus status,
        DateTime createdAtUtc)
        : base(id)
    {
        Title = title;
        Description = description;
        Address = address;
        CustomerId = customerId;
        OrganizationId = organizationId;
        Status = status;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = createdAtUtc;
    }

    /// <summary>Required by EF Core's materialiser.</summary>
    private Job()
    {
        Title = string.Empty;
        Address = null!;
    }

    public string Title { get; private set; }

    public string? Description { get; private set; }

    public Address Address { get; private set; }

    public JobStatus Status { get; private set; }

    /// <summary>When the work is due. Absent while the job is still a draft.</summary>
    public DateTime? ScheduledDateUtc { get; private set; }

    public Guid? AssigneeId { get; private set; }

    public Guid CustomerId { get; private init; }

    /// <summary>
    /// The owning tenant.
    /// </summary>
    /// <remarks>
    /// Assigned at construction and never settable afterwards. A job cannot be
    /// moved between organisations, so there is no method to do it — the absence
    /// of a mutator is the enforcement.
    /// </remarks>
    public Guid OrganizationId { get; private init; }

    public DateTime? StartedAtUtc { get; private set; }

    public DateTime? CompletedAtUtc { get; private set; }

    public DateTime? CancelledAtUtc { get; private set; }

    public string? CancellationReason { get; private set; }

    public string? SignatureUrl { get; private set; }

    public DateTime CreatedAtUtc { get; private init; }

    public DateTime UpdatedAtUtc { get; private set; }

    /// <summary>
    /// The photos captured for this job.
    /// </summary>
    /// <remarks>
    /// A read-only view over a private list. Returning the <c>List&lt;T&gt;</c>
    /// itself would let any caller <c>Add</c> to it and bypass
    /// <see cref="AddPhoto"/> — and with it the rule that photos may only be
    /// attached while work is in progress.
    /// </remarks>
    public IReadOnlyCollection<JobPhoto> Photos => _photos.AsReadOnly();

    /* ---------------------------------------------------------------------- */
    /* Factory methods                                                        */
    /* ---------------------------------------------------------------------- */

    /// <summary>
    /// Creates a job that has not been scheduled yet.
    /// </summary>
    /// <remarks>
    /// Office staff routinely record a job before a crew or a date exists for
    /// it. Modelling that as a real state, rather than as a scheduled job with
    /// null dates, is what lets <see cref="ScheduledDateUtc"/> and
    /// <see cref="AssigneeId"/> be genuinely required once the job is scheduled.
    /// </remarks>
    public static Result<Job> CreateDraft(
        string title,
        string? description,
        Address address,
        Guid customerId,
        Guid organizationId,
        DateTime utcNow)
    {
        var validation = ValidateCore(title, description, address, customerId, organizationId);
        if (validation.IsFailure)
        {
            return Result.Failure<Job>(validation.Error);
        }

        var job = new Job(
            Guid.NewGuid(),
            title.Trim(),
            Normalise(description),
            address,
            customerId,
            organizationId,
            JobStatus.Draft,
            utcNow);

        job.Raise(new JobCreatedDomainEvent(job.Id, organizationId, customerId, AssigneeId: null));

        return Result.Success(job);
    }

    /// <summary>
    /// Creates a job that is already booked in with a crew and a date.
    /// </summary>
    /// <remarks>
    /// A second named factory rather than optional parameters on one. The two
    /// produce genuinely different objects with different obligations, and a
    /// caller passing <c>null</c> for a date would otherwise silently get a
    /// draft when it meant to book work in. This is the GoF <b>Factory Method</b>
    /// pattern used for intent, not for polymorphism.
    /// </remarks>
    public static Result<Job> CreateScheduled(
        string title,
        string? description,
        Address address,
        Guid customerId,
        Guid organizationId,
        DateTime scheduledDateUtc,
        Guid assigneeId,
        DateTime utcNow)
    {
        var draft = CreateDraft(title, description, address, customerId, organizationId, utcNow);
        if (draft.IsFailure)
        {
            return draft;
        }

        var job = draft.Value;

        // Scheduling runs through the same method an already-created job uses, so
        // "cannot be scheduled in the past" is checked by one piece of code
        // whichever route the job arrives by.
        var scheduled = job.Schedule(scheduledDateUtc, assigneeId, utcNow);
        if (scheduled.IsFailure)
        {
            return Result.Failure<Job>(scheduled.Error);
        }

        // The job was created and scheduled in a single operation, so it should
        // announce itself once, already scheduled. Clearing and re-raising keeps
        // subscribers from seeing a draft that never existed as far as any
        // observer outside this method is concerned.
        job.ClearDomainEvents();
        job.Raise(new JobCreatedDomainEvent(job.Id, organizationId, customerId, assigneeId));

        return Result.Success(job);
    }

    /* ---------------------------------------------------------------------- */
    /* Behaviour                                                              */
    /* ---------------------------------------------------------------------- */

    /// <summary>Books the job in with a crew and a date.</summary>
    public Result Schedule(DateTime scheduledDateUtc, Guid assigneeId, DateTime utcNow)
    {
        var transition = EnsureCanTransitionTo(JobStatus.Scheduled);
        if (transition.IsFailure)
        {
            return transition;
        }

        if (assigneeId == Guid.Empty)
        {
            return Result.Failure(JobErrors.AssigneeRequired);
        }

        // The invariant. Compared against an injected clock rather than
        // `DateTime.UtcNow` so the rule is testable without waiting for time to
        // pass or picking a date that expires.
        if (scheduledDateUtc < utcNow)
        {
            return Result.Failure(JobErrors.ScheduledInThePast);
        }

        ScheduledDateUtc = scheduledDateUtc;
        AssigneeId = assigneeId;
        Status = JobStatus.Scheduled;
        Touch(utcNow);

        return Result.Success();
    }

    /// <summary>Marks work as under way. Legal only from <see cref="JobStatus.Scheduled"/>.</summary>
    public Result Start(DateTime utcNow)
    {
        var transition = EnsureCanTransitionTo(JobStatus.InProgress);
        if (transition.IsFailure)
        {
            return transition;
        }

        StartedAtUtc = utcNow;
        Status = JobStatus.InProgress;
        Touch(utcNow);

        return Result.Success();
    }

    /// <summary>
    /// Finishes the job and raises <see cref="JobCompletedDomainEvent"/>.
    /// </summary>
    /// <remarks>
    /// The event is raised here, by the aggregate, rather than by the command
    /// handler. The aggregate is the only thing that knows the transition
    /// actually happened; a handler raising it would announce a completion that
    /// a failed guard may have prevented.
    /// </remarks>
    public Result Complete(string signatureUrl, DateTime utcNow)
    {
        var transition = EnsureCanTransitionTo(JobStatus.Completed);
        if (transition.IsFailure)
        {
            return transition;
        }

        if (string.IsNullOrWhiteSpace(signatureUrl))
        {
            return Result.Failure(JobErrors.SignatureRequired);
        }

        // Guarded by the transition table: only InProgress reaches here, and
        // reaching InProgress requires an assignee.
        if (AssigneeId is not { } assigneeId)
        {
            return Result.Failure(JobErrors.AssigneeRequired);
        }

        SignatureUrl = signatureUrl.Trim();
        CompletedAtUtc = utcNow;
        Status = JobStatus.Completed;
        Touch(utcNow);

        Raise(new JobCompletedDomainEvent(Id, Title, OrganizationId, CustomerId, assigneeId, utcNow));

        return Result.Success();
    }

    /// <summary>Abandons the job, recording why.</summary>
    public Result Cancel(string reason, DateTime utcNow)
    {
        var transition = EnsureCanTransitionTo(JobStatus.Cancelled);
        if (transition.IsFailure)
        {
            return transition;
        }

        if (string.IsNullOrWhiteSpace(reason))
        {
            return Result.Failure(JobErrors.CancellationReasonRequired);
        }

        CancellationReason = reason.Trim();
        CancelledAtUtc = utcNow;
        Status = JobStatus.Cancelled;
        Touch(utcNow);

        Raise(new JobCancelledDomainEvent(Id, OrganizationId, CancellationReason, utcNow));

        return Result.Success();
    }

    /// <summary>
    /// Attaches a photo to the job.
    /// </summary>
    /// <remarks>
    /// <b>Creator (GRASP).</b> The job creates its own photos, because the job is
    /// what aggregates them and holds the data they need. Nothing outside this
    /// assembly can construct a <see cref="JobPhoto"/>, so this is the only door.
    /// </remarks>
    public Result AddPhoto(string url, string? caption, DateTime capturedAtUtc, DateTime utcNow)
    {
        if (Status != JobStatus.InProgress)
        {
            return Result.Failure(JobErrors.PhotosOnlyWhileInProgress);
        }

        var photo = JobPhoto.Create(Id, url, capturedAtUtc, caption);
        if (photo.IsFailure)
        {
            return Result.Failure(photo.Error);
        }

        _photos.Add(photo.Value);
        Touch(utcNow);

        return Result.Success();
    }

    /* ---------------------------------------------------------------------- */
    /* Internals                                                              */
    /* ---------------------------------------------------------------------- */

    /// <summary>
    /// The single enforcement point for the lifecycle rules.
    /// </summary>
    /// <remarks>
    /// Every state-changing method starts here. Adding a status therefore means
    /// editing one table, not auditing five methods for the guard they should
    /// have grown.
    /// </remarks>
    private Result EnsureCanTransitionTo(JobStatus target)
        => AllowedTransitions[Status].Contains(target)
            ? Result.Success()
            : Result.Failure(JobErrors.InvalidTransition(Status, target));

    private void Touch(DateTime utcNow) => UpdatedAtUtc = utcNow;

    private static Result ValidateCore(
        string title,
        string? description,
        Address address,
        Guid customerId,
        Guid organizationId)
    {
        if (string.IsNullOrWhiteSpace(title))
        {
            return Result.Failure(JobErrors.TitleRequired);
        }

        if (title.Trim().Length > TitleMaxLength)
        {
            return Result.Failure(JobErrors.TitleTooLong);
        }

        if (description is not null && description.Length > DescriptionMaxLength)
        {
            return Result.Failure(JobErrors.DescriptionTooLong);
        }

        // `Address` cannot exist in an invalid state, so there is nothing to
        // re-validate here — only its presence to confirm.
        ArgumentNullException.ThrowIfNull(address);

        if (customerId == Guid.Empty)
        {
            return Result.Failure(JobErrors.CustomerRequired);
        }

        return organizationId == Guid.Empty
            ? Result.Failure(JobErrors.OrganizationRequired)
            : Result.Success();
    }

    private static string? Normalise(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
