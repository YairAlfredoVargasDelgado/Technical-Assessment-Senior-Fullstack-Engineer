using FluentAssertions;

using JobTracker.Common.Application.Abstractions.Authentication;
using JobTracker.Common.Application.Abstractions.Clock;
using JobTracker.Modules.Jobs.Application.Abstractions;
using JobTracker.Modules.Jobs.Application.Jobs.CreateJob;
using JobTracker.Modules.Jobs.Domain.Jobs;
using JobTracker.Modules.Jobs.Domain.Jobs.Events;

using Moq;

namespace JobTracker.Jobs.Application.UnitTests.Jobs;

/// <summary>
/// Tests for <see cref="CreateJobCommandHandler"/>.
/// </summary>
/// <remarks>
/// Every collaborator is mocked, so what is under test is exactly the handler's
/// own behaviour: does it read the tenant from the right place, choose the right
/// factory, persist, and commit — and does it stop at the first failure without
/// committing anything.
/// <para>
/// Note what is <b>not</b> asserted here: that a job cannot be scheduled in the
/// past, or that a title is required. Those are the aggregate's rules and they
/// are tested against the aggregate. Re-asserting them through the handler would
/// mean two tests fail for one bug, and would quietly bless a handler that
/// re-implemented the rule instead of delegating it.
/// </para>
/// </remarks>
public sealed class CreateJobCommandHandlerTests
{
    private static readonly DateTime Now = new(2030, 6, 1, 9, 0, 0, DateTimeKind.Utc);
    private static readonly Guid OrganizationId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private static readonly Guid CustomerId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid AssigneeId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    private readonly Mock<IJobRepository> _repository = new(MockBehavior.Strict);
    private readonly Mock<IJobsUnitOfWork> _unitOfWork = new(MockBehavior.Strict);
    private readonly Mock<ITenantContext> _tenantContext = new();
    private readonly Mock<IDateTimeProvider> _clock = new();

    private readonly CreateJobCommandHandler _handler;

    public CreateJobCommandHandlerTests()
    {
        _tenantContext.SetupGet(context => context.OrganizationId).Returns(OrganizationId);
        _clock.SetupGet(clock => clock.UtcNow).Returns(Now);

        _handler = new CreateJobCommandHandler(
            _repository.Object,
            _unitOfWork.Object,
            _tenantContext.Object,
            _clock.Object);
    }

    /// <remarks>
    /// <c>MockBehavior.Strict</c> on the repository and the unit of work is
    /// deliberate: an unconfigured call throws, so a handler that starts calling
    /// something new fails loudly instead of silently passing against a mock that
    /// returns default values.
    /// </remarks>
    private void ExpectPersistence(Action<Job>? captureJob = null)
    {
        _repository
            .Setup(repository => repository.AddAsync(It.IsAny<Job>(), It.IsAny<CancellationToken>()))
            .Callback<Job, CancellationToken>((job, _) => captureJob?.Invoke(job))
            .Returns(Task.CompletedTask);

        _unitOfWork
            .Setup(unitOfWork => unitOfWork.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);
    }

    private static CreateJobCommand ValidCommand(DateTime? scheduledDate = null, Guid? assigneeId = null) => new(
        Title: "Roof inspection",
        Description: "North slope",
        Street: "12 Elm Street",
        City: "Newark",
        State: "NJ",
        ZipCode: "07102",
        Latitude: 40.7357,
        Longitude: -74.1724,
        CustomerId: CustomerId,
        ScheduledDateUtc: scheduledDate,
        AssigneeId: assigneeId);

    /* ---------------------------------------------------------------------- */

    [Fact]
    public async Task Handle_WithoutScheduling_CreatesADraftAndReturnsItsId()
    {
        Job? persisted = null;
        ExpectPersistence(job => persisted = job);

        var result = await _handler.Handle(ValidCommand(), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        persisted.Should().NotBeNull();
        persisted!.Status.Should().Be(JobStatus.Draft);
        result.Value.Should().Be(persisted.Id);
    }

    [Fact]
    public async Task Handle_WithScheduling_CreatesAScheduledJob()
    {
        Job? persisted = null;
        ExpectPersistence(job => persisted = job);

        var result = await _handler.Handle(
            ValidCommand(Now.AddDays(2), AssigneeId),
            CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        persisted!.Status.Should().Be(JobStatus.Scheduled);
        persisted.ScheduledDateUtc.Should().Be(Now.AddDays(2));
        persisted.AssigneeId.Should().Be(AssigneeId);
    }

    [Fact]
    public async Task Handle_RaisesJobCreatedDomainEventOnTheAggregate()
    {
        Job? persisted = null;
        ExpectPersistence(job => persisted = job);

        await _handler.Handle(ValidCommand(Now.AddDays(2), AssigneeId), CancellationToken.None);

        // The event must still be attached when the job reaches the repository:
        // the outbox interceptor harvests it during SaveChangesAsync, so an event
        // raised and cleared before that point would never be published.
        persisted!.DomainEvents.Should().ContainSingle()
            .Which.Should().BeOfType<JobCreatedDomainEvent>()
            .Which.AssigneeId.Should().Be(AssigneeId);
    }

    /// <remarks>
    /// The tenant must come from <see cref="ITenantContext"/> — the authenticated
    /// principal — and never from the request. This test is the regression guard
    /// for the most direct multi-tenancy breach there is.
    /// </remarks>
    [Fact]
    public async Task Handle_TakesTheOrganizationFromTheTenantContextRatherThanTheRequest()
    {
        Job? persisted = null;
        ExpectPersistence(job => persisted = job);

        await _handler.Handle(ValidCommand(), CancellationToken.None);

        persisted!.OrganizationId.Should().Be(OrganizationId);
        _tenantContext.VerifyGet(context => context.OrganizationId, Times.Once);
    }

    [Fact]
    public async Task Handle_PersistsThenCommits()
    {
        var sequence = new List<string>();

        _repository
            .Setup(repository => repository.AddAsync(It.IsAny<Job>(), It.IsAny<CancellationToken>()))
            .Callback(() => sequence.Add("add"))
            .Returns(Task.CompletedTask);

        _unitOfWork
            .Setup(unitOfWork => unitOfWork.SaveChangesAsync(It.IsAny<CancellationToken>()))
            .Callback(() => sequence.Add("save"))
            .ReturnsAsync(1);

        await _handler.Handle(ValidCommand(), CancellationToken.None);

        // Order matters: committing before registering the aggregate would write
        // an empty transaction and lose the job.
        sequence.Should().Equal("add", "save");
    }

    [Fact]
    public async Task Handle_WithAnInvalidAddress_FailsAndTouchesNothing()
    {
        var command = ValidCommand() with { Street = "   " };

        var result = await _handler.Handle(command, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Should().Be(AddressErrors.StreetRequired);

        // Strict mocks make this assertion redundant and worth keeping anyway: it
        // states the intent that a failed command must not open a transaction.
        _repository.Verify(
            repository => repository.AddAsync(It.IsAny<Job>(), It.IsAny<CancellationToken>()),
            Times.Never);
        _unitOfWork.Verify(
            unitOfWork => unitOfWork.SaveChangesAsync(It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_WhenTheAggregateRejectsTheCommand_DoesNotCommit()
    {
        // A past date. The handler does not know this rule — the aggregate does,
        // and the handler's only job is to propagate its refusal.
        var command = ValidCommand(Now.AddDays(-1), AssigneeId);

        var result = await _handler.Handle(command, CancellationToken.None);

        result.IsFailure.Should().BeTrue();
        result.Error.Should().Be(JobErrors.ScheduledInThePast);

        _unitOfWork.Verify(
            unitOfWork => unitOfWork.SaveChangesAsync(It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task Handle_ReadsTheClockThroughTheProviderRatherThanTheSystem()
    {
        Job? persisted = null;
        ExpectPersistence(job => persisted = job);

        await _handler.Handle(ValidCommand(), CancellationToken.None);

        // The whole reason IDateTimeProvider exists: a fixed instant makes the
        // "not in the past" rule testable without a date that expires.
        persisted!.CreatedAtUtc.Should().Be(Now);
        _clock.VerifyGet(clock => clock.UtcNow, Times.AtLeastOnce);
    }
}
