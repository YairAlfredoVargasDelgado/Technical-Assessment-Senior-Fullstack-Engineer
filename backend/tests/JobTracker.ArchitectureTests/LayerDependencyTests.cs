using JobTracker.ArchitectureTests.Abstractions;

using NetArchTest.Rules;

namespace JobTracker.ArchitectureTests;

/// <summary>
/// The dependency rule: nothing inner may know about anything outer.
/// </summary>
public sealed class LayerDependencyTests : ArchitectureTestBase
{
    /* ---------------------------------------------------------------------- */
    /* Domain                                                                 */
    /* ---------------------------------------------------------------------- */

    [Fact]
    public void Domain_ShouldNotDependOnApplication()
        => ShouldHold(
            Types.InAssembly(JobsDomain)
                .Should()
                .NotHaveDependencyOn(JobsApplicationNamespace)
                .GetResult(),
            "the domain must not know that an application layer exists — it is the innermost layer");

    [Fact]
    public void Domain_ShouldNotDependOnInfrastructure()
        => ShouldHold(
            Types.InAssembly(JobsDomain)
                .Should()
                .NotHaveDependencyOn(JobsInfrastructureNamespace)
                .GetResult(),
            "a domain that references its persistence cannot be tested without a database");

    [Fact]
    public void Domain_ShouldNotDependOnPresentation()
        => ShouldHold(
            Types.InAssembly(JobsDomain)
                .Should()
                .NotHaveDependencyOn(JobsPresentationNamespace)
                .GetResult(),
            "the domain must be reachable from a background job, not only from HTTP");

    /// <remarks>
    /// The rule that keeps the domain portable. EF Core in the domain would make
    /// aggregates carry persistence attributes and navigation semantics, and would
    /// make every domain unit test start a change tracker.
    /// </remarks>
    [Theory]
    [InlineData("Microsoft.EntityFrameworkCore")]
    [InlineData("Npgsql")]
    [InlineData("Dapper")]
    [InlineData("Microsoft.AspNetCore")]
    [InlineData("Hangfire")]
    [InlineData("FluentValidation")]
    public void Domain_ShouldNotDependOnInfrastructureFrameworks(string framework)
        => ShouldHold(
            Types.InAssembly(JobsDomain).Should().NotHaveDependencyOn(framework).GetResult(),
            $"the domain must not depend on {framework}");

    /// <remarks>
    /// <c>MediatR.Contracts</c> is deliberately absent from the list above. It is a
    /// contracts-only package — the marker interfaces <c>IRequest</c> and
    /// <c>INotification</c>, no behaviour and no dependencies of its own — and the
    /// domain references it so domain events can be dispatched without a
    /// hand-rolled fan-out mechanism. This test pins that exception so it stays a
    /// documented decision rather than becoming the first of many.
    /// </remarks>
    [Fact]
    public void Domain_ShouldNotDependOnMediatRImplementation()
        => ShouldHold(
            Types.InAssembly(JobsDomain)
                .Should()
                .NotHaveDependencyOn("MediatR.Pipeline")
                .GetResult(),
            "only MediatR's contracts assembly is permitted in the domain, never its implementation");

    /* ---------------------------------------------------------------------- */
    /* Application                                                            */
    /* ---------------------------------------------------------------------- */

    [Fact]
    public void Application_ShouldNotDependOnInfrastructure()
        => ShouldHold(
            Types.InAssembly(JobsApplication)
                .Should()
                .NotHaveDependencyOn(JobsInfrastructureNamespace)
                .GetResult(),
            "handlers depend on IJobRepository, never on the EF Core implementation of it");

    [Fact]
    public void Application_ShouldNotDependOnPresentation()
        => ShouldHold(
            Types.InAssembly(JobsApplication)
                .Should()
                .NotHaveDependencyOn(JobsPresentationNamespace)
                .GetResult(),
            "a use case must not know which transport invoked it");

    [Theory]
    [InlineData("Microsoft.EntityFrameworkCore")]
    [InlineData("Npgsql")]
    [InlineData("Microsoft.AspNetCore")]
    public void Application_ShouldNotDependOnInfrastructureFrameworks(string framework)
        => ShouldHold(
            Types.InAssembly(JobsApplication).Should().NotHaveDependencyOn(framework).GetResult(),
            $"the application layer must not depend on {framework}");

    /* ---------------------------------------------------------------------- */
    /* Module boundaries — the modular monolith's load-bearing rule            */
    /* ---------------------------------------------------------------------- */

    /// <remarks>
    /// The single most important test in this file. If Billing can see
    /// <c>Job</c>, the modular monolith has become a monolith: Jobs can no longer
    /// change its domain without breaking Billing, and the boundary that was
    /// supposed to allow independent evolution has stopped existing.
    /// </remarks>
    [Fact]
    public void Billing_ShouldNotDependOnTheJobsDomain()
        => ShouldHold(
            Types.InAssembly(BillingApplication)
                .Should()
                .NotHaveDependencyOn(JobsDomainNamespace)
                .GetResult(),
            "Billing must reach Jobs only through its published integration events");

    [Fact]
    public void Billing_ShouldNotDependOnTheJobsApplicationLayer()
        => ShouldHold(
            Types.InAssembly(BillingApplication)
                .Should()
                .NotHaveDependencyOn(JobsApplicationNamespace)
                .GetResult(),
            "a module must not invoke another module's use cases directly");

    [Fact]
    public void Billing_ShouldNotDependOnTheJobsInfrastructure()
        => ShouldHold(
            Types.InAssembly(BillingApplication)
                .Should()
                .NotHaveDependencyOn(JobsInfrastructureNamespace)
                .GetResult(),
            "a module must not reach into another module's database context");

    /* ---------------------------------------------------------------------- */
    /* Open Host Service                                                      */
    /* ---------------------------------------------------------------------- */

    /// <remarks>
    /// The published contract must stay publishable. If an integration event
    /// referenced a domain type, every consumer would have to link against the
    /// producer's domain assembly — and the contract would change every time that
    /// type did, which is precisely what a published language exists to prevent.
    /// </remarks>
    [Fact]
    public void IntegrationEvents_ShouldNotDependOnTheDomain()
        => ShouldHold(
            Types.InAssembly(JobsIntegrationEvents)
                .Should()
                .NotHaveDependencyOn(JobsDomainNamespace)
                .GetResult(),
            "integration events carry primitives only, so consumers never link against the producer's domain");

    [Fact]
    public void IntegrationEvents_ShouldNotDependOnTheApplicationLayer()
        => ShouldHold(
            Types.InAssembly(JobsIntegrationEvents)
                .Should()
                .NotHaveDependencyOn(JobsApplicationNamespace)
                .GetResult(),
            "the published contract must not drag the producer's use cases along with it");

    /* ---------------------------------------------------------------------- */
    /* Shared kernel                                                          */
    /* ---------------------------------------------------------------------- */

    [Fact]
    public void CommonDomain_ShouldNotDependOnAnyModule()
        => ShouldHold(
            Types.InAssembly(CommonDomain)
                .Should()
                .NotHaveDependencyOnAny(JobsDomainNamespace, "JobTracker.Modules.Billing")
                .GetResult(),
            "the shared kernel is depended upon by modules and must never depend on one");

    [Fact]
    public void CommonApplication_ShouldNotDependOnAnyModule()
        => ShouldHold(
            Types.InAssembly(CommonApplication)
                .Should()
                .NotHaveDependencyOnAny("JobTracker.Modules")
                .GetResult(),
            "shared application abstractions must stay module-agnostic");
}
