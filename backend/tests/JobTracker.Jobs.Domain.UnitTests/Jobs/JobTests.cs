using FluentAssertions;

using JobTracker.Common.Domain.Results;
using JobTracker.Modules.Jobs.Domain.Jobs;
using JobTracker.Modules.Jobs.Domain.Jobs.Events;

namespace JobTracker.Jobs.Domain.UnitTests.Jobs;

/// <summary>
/// Tests for the <see cref="Job"/> aggregate's invariants.
/// </summary>
/// <remarks>
/// Every test drives the aggregate through its public methods and asserts on the
/// returned <c>Result</c>. None of them reach past the API to set a field
/// directly — which they could not do anyway, and that is the property under
/// test as much as any individual rule.
/// </remarks>
public sealed class JobTests
{
    private static readonly DateTime Now = new(2030, 6, 1, 9, 0, 0, DateTimeKind.Utc);
    private static readonly Guid CustomerId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid OrganizationId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid AssigneeId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    private static Address ValidAddress() =>
        Address.Create("12 Elm Street", "Newark", "NJ", "07102", 40.7357, -74.1724).Value;

    private static Job Draft() =>
        Job.CreateDraft("Roof inspection", "North slope", ValidAddress(), CustomerId, OrganizationId, Now).Value;

    private static Job Scheduled()
    {
        var job = Draft();
        job.Schedule(Now.AddDays(3), AssigneeId, Now).IsSuccess.Should().BeTrue();
        return job;
    }

    private static Job InProgress()
    {
        var job = Scheduled();
        job.Start(Now).IsSuccess.Should().BeTrue();
        return job;
    }

    private static Job Completed()
    {
        var job = InProgress();
        job.Complete("https://cdn.example/signature.png", Now).IsSuccess.Should().BeTrue();
        return job;
    }

    private static Job Cancelled()
    {
        var job = Scheduled();
        job.Cancel("Customer postponed", Now).IsSuccess.Should().BeTrue();
        return job;
    }

    /* ---------------------------------------------------------------------- */
    /* Creation                                                               */
    /* ---------------------------------------------------------------------- */

    [Fact]
    public void CreateDraft_WithValidInput_ProducesADraftJob()
    {
        var result = Job.CreateDraft("Roof inspection", "North slope", ValidAddress(), CustomerId, OrganizationId, Now);

        result.IsSuccess.Should().BeTrue();
        result.Value.Status.Should().Be(JobStatus.Draft);
        result.Value.ScheduledDateUtc.Should().BeNull();
        result.Value.AssigneeId.Should().BeNull();
        result.Value.OrganizationId.Should().Be(OrganizationId);
    }

    [Fact]
    public void CreateDraft_RaisesJobCreatedDomainEvent()
    {
        var job = Draft();

        job.DomainEvents.Should().ContainSingle()
            .Which.Should().BeOfType<JobCreatedDomainEvent>()
            .Which.JobId.Should().Be(job.Id);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void CreateDraft_WithBlankTitle_Fails(string title)
    {
        var result = Job.CreateDraft(title, null, ValidAddress(), CustomerId, OrganizationId, Now);

        result.IsFailure.Should().BeTrue();
        result.Error.Should().Be(JobErrors.TitleRequired);
    }

    [Fact]
    public void CreateDraft_WithOverlongTitle_Fails()
    {
        var result = Job.CreateDraft(
            new string('x', Job.TitleMaxLength + 1),
            null,
            ValidAddress(),
            CustomerId,
            OrganizationId,
            Now);

        result.Error.Should().Be(JobErrors.TitleTooLong);
    }

    [Fact]
    public void CreateDraft_WithoutCustomer_Fails()
    {
        var result = Job.CreateDraft("Roof", null, ValidAddress(), Guid.Empty, OrganizationId, Now);

        result.Error.Should().Be(JobErrors.CustomerRequired);
    }

    [Fact]
    public void CreateDraft_WithoutOrganization_Fails()
    {
        var result = Job.CreateDraft("Roof", null, ValidAddress(), CustomerId, Guid.Empty, Now);

        result.Error.Should().Be(JobErrors.OrganizationRequired);
    }

    [Fact]
    public void CreateDraft_TrimsTitleAndNormalisesBlankDescriptionToNull()
    {
        var job = Job.CreateDraft("  Roof inspection  ", "   ", ValidAddress(), CustomerId, OrganizationId, Now).Value;

        job.Title.Should().Be("Roof inspection");
        job.Description.Should().BeNull();
    }

    [Fact]
    public void CreateScheduled_ProducesAScheduledJobAndASingleCreatedEventCarryingTheAssignee()
    {
        var result = Job.CreateScheduled(
            "Roof inspection",
            null,
            ValidAddress(),
            CustomerId,
            OrganizationId,
            Now.AddDays(2),
            AssigneeId,
            Now);

        result.IsSuccess.Should().BeTrue();
        result.Value.Status.Should().Be(JobStatus.Scheduled);

        // Observers must not see a draft that, from the outside, never existed.
        result.Value.DomainEvents.Should().ContainSingle()
            .Which.Should().BeOfType<JobCreatedDomainEvent>()
            .Which.AssigneeId.Should().Be(AssigneeId);
    }

    [Fact]
    public void CreateScheduled_InThePast_Fails()
    {
        var result = Job.CreateScheduled(
            "Roof inspection",
            null,
            ValidAddress(),
            CustomerId,
            OrganizationId,
            Now.AddMinutes(-1),
            AssigneeId,
            Now);

        result.IsFailure.Should().BeTrue();
        result.Error.Should().Be(JobErrors.ScheduledInThePast);
    }

    /* ---------------------------------------------------------------------- */
    /* Invariant: a job cannot be scheduled in the past                       */
    /* ---------------------------------------------------------------------- */

    [Fact]
    public void Schedule_InThePast_IsRejected()
    {
        var job = Draft();

        var result = job.Schedule(Now.AddSeconds(-1), AssigneeId, Now);

        result.IsFailure.Should().BeTrue();
        result.Error.Should().Be(JobErrors.ScheduledInThePast);
        job.Status.Should().Be(JobStatus.Draft, "a rejected operation must leave the aggregate untouched");
        job.ScheduledDateUtc.Should().BeNull();
    }

    [Fact]
    public void Schedule_ExactlyNow_IsAccepted()
    {
        // The boundary is "in the past", not "not in the future": a dispatcher
        // booking a crew for right now is a legitimate operation.
        var job = Draft();

        job.Schedule(Now, AssigneeId, Now).IsSuccess.Should().BeTrue();
    }

    [Fact]
    public void Schedule_WithoutAssignee_IsRejected()
    {
        var job = Draft();

        job.Schedule(Now.AddDays(1), Guid.Empty, Now).Error.Should().Be(JobErrors.AssigneeRequired);
    }

    /* ---------------------------------------------------------------------- */
    /* Invariant: only Scheduled jobs may start                               */
    /* ---------------------------------------------------------------------- */

    [Fact]
    public void Start_FromScheduled_Succeeds()
    {
        var job = Scheduled();

        job.Start(Now).IsSuccess.Should().BeTrue();
        job.Status.Should().Be(JobStatus.InProgress);
        job.StartedAtUtc.Should().Be(Now);
    }

    [Fact]
    public void Start_FromDraft_IsRejected()
    {
        var job = Draft();

        var result = job.Start(Now);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be("Job.InvalidTransition");
        job.Status.Should().Be(JobStatus.Draft);
    }

    /* ---------------------------------------------------------------------- */
    /* Invariant: terminal states are terminal                                */
    /* ---------------------------------------------------------------------- */

    public static TheoryData<string> TerminalStates() => ["Completed", "Cancelled"];

    [Theory]
    [MemberData(nameof(TerminalStates))]
    public void ATerminalJob_RejectsEveryTransition(string terminalState)
    {
        var job = terminalState == "Completed" ? Completed() : Cancelled();
        var statusBefore = job.Status;

        var attempts = new[]
        {
            job.Schedule(Now.AddDays(1), AssigneeId, Now),
            job.Start(Now),
            job.Complete("https://cdn.example/signature.png", Now),
            job.Cancel("Changed mind", Now),
        };

        attempts.Should().OnlyContain(result => result.IsFailure);
        attempts.Should().OnlyContain(result => result.Error.Code == "Job.InvalidTransition");
        job.Status.Should().Be(statusBefore);
    }

    /* ---------------------------------------------------------------------- */
    /* Completion                                                             */
    /* ---------------------------------------------------------------------- */

    [Fact]
    public void Complete_FromInProgress_SucceedsAndRaisesJobCompletedDomainEvent()
    {
        var job = InProgress();
        job.ClearDomainEvents();

        var result = job.Complete("https://cdn.example/signature.png", Now);

        result.IsSuccess.Should().BeTrue();
        job.Status.Should().Be(JobStatus.Completed);
        job.CompletedAtUtc.Should().Be(Now);

        var raised = job.DomainEvents.Should().ContainSingle()
            .Which.Should().BeOfType<JobCompletedDomainEvent>().Subject;

        raised.JobId.Should().Be(job.Id);
        raised.OrganizationId.Should().Be(OrganizationId);
        raised.CustomerId.Should().Be(CustomerId);
        raised.AssigneeId.Should().Be(AssigneeId);

        // Half of the downstream idempotency key.
        raised.CompletedAtUtc.Should().Be(Now);
    }

    [Fact]
    public void Complete_WithoutSignature_IsRejectedAndRaisesNoEvent()
    {
        var job = InProgress();
        job.ClearDomainEvents();

        var result = job.Complete("   ", Now);

        result.Error.Should().Be(JobErrors.SignatureRequired);
        job.Status.Should().Be(JobStatus.InProgress);
        job.DomainEvents.Should().BeEmpty("a rejected completion did not happen, so nothing may be announced");
    }

    [Fact]
    public void Complete_FromScheduled_IsRejected()
    {
        var job = Scheduled();

        job.Complete("https://cdn.example/signature.png", Now).Error.Code
            .Should().Be("Job.InvalidTransition");
    }

    /* ---------------------------------------------------------------------- */
    /* Cancellation                                                           */
    /* ---------------------------------------------------------------------- */

    [Theory]
    [InlineData(JobStatus.Draft)]
    [InlineData(JobStatus.Scheduled)]
    [InlineData(JobStatus.InProgress)]
    public void Cancel_FromAnyNonTerminalState_Succeeds(JobStatus from)
    {
        var job = from switch
        {
            JobStatus.Draft => Draft(),
            JobStatus.Scheduled => Scheduled(),
            _ => InProgress(),
        };
        job.ClearDomainEvents();

        var result = job.Cancel("Storm damage", Now);

        result.IsSuccess.Should().BeTrue();
        job.Status.Should().Be(JobStatus.Cancelled);
        job.CancellationReason.Should().Be("Storm damage");

        job.DomainEvents.Should().ContainSingle()
            .Which.Should().BeOfType<JobCancelledDomainEvent>()
            .Which.Reason.Should().Be("Storm damage");
    }

    [Fact]
    public void Cancel_WithoutReason_IsRejected()
    {
        var job = Scheduled();

        job.Cancel("  ", Now).Error.Should().Be(JobErrors.CancellationReasonRequired);
        job.Status.Should().Be(JobStatus.Scheduled);
    }

    /* ---------------------------------------------------------------------- */
    /* Photos: reachable only through the aggregate root                      */
    /* ---------------------------------------------------------------------- */

    [Fact]
    public void AddPhoto_WhileInProgress_Succeeds()
    {
        var job = InProgress();

        var result = job.AddPhoto("https://cdn.example/before.jpg", "North slope", Now, Now);

        result.IsSuccess.Should().BeTrue();
        job.Photos.Should().ContainSingle()
            .Which.Url.Should().Be("https://cdn.example/before.jpg");
    }

    [Theory]
    [InlineData(JobStatus.Draft)]
    [InlineData(JobStatus.Scheduled)]
    [InlineData(JobStatus.Completed)]
    public void AddPhoto_OutsideInProgress_IsRejected(JobStatus from)
    {
        var job = from switch
        {
            JobStatus.Draft => Draft(),
            JobStatus.Scheduled => Scheduled(),
            _ => Completed(),
        };

        job.AddPhoto("https://cdn.example/x.jpg", null, Now, Now).Error
            .Should().Be(JobErrors.PhotosOnlyWhileInProgress);
        job.Photos.Should().BeEmpty();
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-a-url")]
    [InlineData("ftp://cdn.example/x.jpg")]
    public void AddPhoto_WithAnUnusableUrl_IsRejected(string url)
    {
        var job = InProgress();

        job.AddPhoto(url, null, Now, Now).IsFailure.Should().BeTrue();
        job.Photos.Should().BeEmpty();
    }

    [Fact]
    public void Photos_AreExposedAsAReadOnlyView()
    {
        var job = InProgress();
        job.AddPhoto("https://cdn.example/before.jpg", null, Now, Now);

        // The declared type carries no mutators, and the runtime object is a
        // read-only wrapper rather than the backing list itself — so a caller
        // cannot down-cast its way back to `Add`.
        job.Photos.Should().NotBeAssignableTo<List<JobPhoto>>();
    }

    /* ---------------------------------------------------------------------- */
    /* Auditing                                                               */
    /* ---------------------------------------------------------------------- */

    [Fact]
    public void EveryAcceptedStateChange_AdvancesUpdatedAt()
    {
        var job = Draft();
        var createdAt = job.UpdatedAtUtc;
        var later = Now.AddHours(1);

        job.Schedule(Now.AddDays(1), AssigneeId, later);

        job.UpdatedAtUtc.Should().Be(later).And.NotBe(createdAt);
        job.CreatedAtUtc.Should().Be(Now, "creation time is immutable");
    }

    [Fact]
    public void ARejectedStateChange_DoesNotAdvanceUpdatedAt()
    {
        var job = Draft();
        var before = job.UpdatedAtUtc;

        job.Start(Now.AddHours(1));

        job.UpdatedAtUtc.Should().Be(before);
    }
}
