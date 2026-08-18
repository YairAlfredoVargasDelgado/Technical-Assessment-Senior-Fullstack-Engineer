using System.Reflection;

using FluentAssertions;

using JobTracker.Common.Application.Abstractions.Messaging;
using JobTracker.Common.Domain.Abstractions;
using JobTracker.Modules.Billing.Application.Abstractions;
using JobTracker.Modules.Jobs.Application.Jobs.CreateJob;
using JobTracker.Modules.Jobs.Domain.Jobs;
using JobTracker.Modules.Jobs.Infrastructure;
using JobTracker.Modules.Jobs.IntegrationEvents;
using JobTracker.Modules.Jobs.Presentation;

using NetArchTest.Rules;

namespace JobTracker.ArchitectureTests.Abstractions;

/// <summary>
/// Shared assembly handles and assertion helpers for the architecture suite.
/// </summary>
/// <remarks>
/// <para>
/// These tests are the mechanism that turns the architecture from a diagram into
/// a constraint. Every rule below is one a reviewer would otherwise have to spot
/// by hand, on a Friday, in a large pull request — and the whole value of the
/// layering is that it holds even when nobody is watching.
/// </para>
/// <para>
/// Each assembly is anchored by a real type rather than by
/// <c>Assembly.Load("name")</c>: a string would still compile after a project was
/// renamed and would then silently test nothing.
/// </para>
/// </remarks>
public abstract class ArchitectureTestBase
{
    protected static readonly Assembly CommonDomain = typeof(AggregateRoot).Assembly;
    protected static readonly Assembly CommonApplication = typeof(IEventBus).Assembly;

    protected static readonly Assembly JobsDomain = typeof(Job).Assembly;
    protected static readonly Assembly JobsApplication = typeof(CreateJobCommand).Assembly;
    protected static readonly Assembly JobsInfrastructure = typeof(JobsModule).Assembly;
    protected static readonly Assembly JobsPresentation = typeof(JobsPresentation).Assembly;
    protected static readonly Assembly JobsIntegrationEvents = typeof(JobCompletedIntegrationEvent).Assembly;

    protected static readonly Assembly BillingApplication = typeof(IBillingUnitOfWork).Assembly;

    protected const string JobsDomainNamespace = "JobTracker.Modules.Jobs.Domain";
    protected const string JobsApplicationNamespace = "JobTracker.Modules.Jobs.Application";
    protected const string JobsInfrastructureNamespace = "JobTracker.Modules.Jobs.Infrastructure";
    protected const string JobsPresentationNamespace = "JobTracker.Modules.Jobs.Presentation";

    /// <summary>
    /// Asserts a rule, naming every offending type when it fails.
    /// </summary>
    /// <remarks>
    /// NetArchTest's own failure message says only that the result was not
    /// successful. Listing the failing types is the difference between a test that
    /// reports a problem and one that reports a problem you can fix.
    /// </remarks>
    protected static void ShouldHold(TestResult result, string because)
    {
        var offenders = result.FailingTypeNames ?? [];

        result.IsSuccessful.Should().BeTrue(
            "{0}. Offending types: {1}",
            because,
            offenders.Count == 0 ? "(none reported)" : string.Join(", ", offenders));
    }
}
