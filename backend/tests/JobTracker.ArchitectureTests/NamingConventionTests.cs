using FluentAssertions;

using JobTracker.ArchitectureTests.Abstractions;
using JobTracker.Common.Application.Abstractions.Messaging;
using JobTracker.Common.Domain.Abstractions;

using FluentValidation;

using NetArchTest.Rules;

namespace JobTracker.ArchitectureTests;

/// <summary>
/// The naming and visibility conventions the assessment specifies, enforced.
/// </summary>
/// <remarks>
/// A convention documented in a README is a convention until the first hurried
/// pull request. Expressed as a test, it is a constraint — and the failure
/// message tells the author what to rename before a reviewer has to.
/// </remarks>
public sealed class NamingConventionTests : ArchitectureTestBase
{
    /* ---------------------------------------------------------------------- */
    /* Commands: sealed, suffixed `Command`                                   */
    /* ---------------------------------------------------------------------- */

    [Fact]
    public void Commands_ShouldBeSealed()
        => ShouldHold(
            Types.InAssembly(JobsApplication)
                .That().ImplementInterface(typeof(ICommand<>))
                .Should().BeSealed()
                .GetResult(),
            "a command is a message, not a base class — sealing it stops an inheritance hierarchy forming");

    [Fact]
    public void Commands_ShouldBeSuffixedWithCommand()
        => ShouldHold(
            Types.InAssembly(JobsApplication)
                .That().ImplementInterface(typeof(ICommand<>))
                .Should().HaveNameEndingWith("Command")
                .GetResult(),
            "the assessment requires commands to end with 'Command'");

    /* ---------------------------------------------------------------------- */
    /* Command handlers: internal sealed, suffixed `CommandHandler`           */
    /* ---------------------------------------------------------------------- */

    [Fact]
    public void CommandHandlers_ShouldBeInternalAndSealed()
        => ShouldHold(
            Types.InAssembly(JobsApplication)
                .That().ImplementInterface(typeof(ICommandHandler<,>))
                .Should().NotBePublic().And().BeSealed()
                .GetResult(),
            "handlers are reached through MediatR; nothing outside the assembly should reference one directly");

    [Fact]
    public void CommandHandlers_ShouldBeSuffixedWithCommandHandler()
        => ShouldHold(
            Types.InAssembly(JobsApplication)
                .That().ImplementInterface(typeof(ICommandHandler<,>))
                .Should().HaveNameEndingWith("CommandHandler")
                .GetResult(),
            "the assessment requires command handlers to end with 'CommandHandler'");

    /* ---------------------------------------------------------------------- */
    /* Queries and query handlers                                             */
    /* ---------------------------------------------------------------------- */

    [Fact]
    public void Queries_ShouldBeSealedAndSuffixedWithQuery()
        => ShouldHold(
            Types.InAssembly(JobsApplication)
                .That().ImplementInterface(typeof(IQuery<>))
                .Should().BeSealed().And().HaveNameEndingWith("Query")
                .GetResult(),
            "the assessment requires queries to be sealed and end with 'Query'");

    [Fact]
    public void QueryHandlers_ShouldBeInternalSealedAndSuffixedWithQueryHandler()
        => ShouldHold(
            Types.InAssembly(JobsApplication)
                .That().ImplementInterface(typeof(IQueryHandler<,>))
                .Should().NotBePublic().And().BeSealed().And().HaveNameEndingWith("QueryHandler")
                .GetResult(),
            "the assessment requires query handlers to be internal sealed and end with 'QueryHandler'");

    /* ---------------------------------------------------------------------- */
    /* Validators                                                             */
    /* ---------------------------------------------------------------------- */

    [Fact]
    public void Validators_ShouldBeInternalSealedAndSuffixedWithValidator()
        => ShouldHold(
            Types.InAssembly(JobsApplication)
                .That().Inherit(typeof(AbstractValidator<>))
                .Should().NotBePublic().And().BeSealed().And().HaveNameEndingWith("Validator")
                .GetResult(),
            "the assessment requires validators to be internal sealed and end with 'Validator'");

    /* ---------------------------------------------------------------------- */
    /* Domain events                                                          */
    /* ---------------------------------------------------------------------- */

    [Fact]
    public void DomainEvents_ShouldBeSealedAndSuffixedWithDomainEvent()
        => ShouldHold(
            Types.InAssembly(JobsDomain)
                .That().ImplementInterface(typeof(IDomainEvent))
                .And().AreNotAbstract()
                .Should().BeSealed().And().HaveNameEndingWith("DomainEvent")
                .GetResult(),
            "a domain event records something that already happened; the name should say so");

    [Fact]
    public void IntegrationEvents_ShouldBeSealedAndSuffixedWithIntegrationEvent()
        => ShouldHold(
            Types.InAssembly(JobsIntegrationEvents)
                .That().ImplementInterface(typeof(IIntegrationEvent))
                .And().AreNotAbstract()
                .Should().BeSealed().And().HaveNameEndingWith("IntegrationEvent")
                .GetResult(),
            "the suffix is what makes the domain/integration distinction visible at every call site");

    /* ---------------------------------------------------------------------- */
    /* Aggregate design                                                       */
    /* ---------------------------------------------------------------------- */

    /// <summary>
    /// No aggregate may expose a public setter.
    /// </summary>
    /// <remarks>
    /// This is the anemic-domain-model guard. A public setter is a way to change
    /// an aggregate without going through a method that names the business action
    /// — and therefore without going through the invariant that method enforces.
    /// Checked with reflection rather than NetArchTest because the rule is about
    /// property accessors, which its fluent API does not reach.
    /// </remarks>
    [Fact]
    public void Aggregates_ShouldNotExposePublicSetters()
    {
        var offenders = JobsDomain
            .GetTypes()
            .Where(type => type.IsSubclassOf(typeof(AggregateRoot)))
            .SelectMany(type => type.GetProperties())
            .Where(property => property.SetMethod is { IsPublic: true })
            .Select(property => $"{property.DeclaringType?.Name}.{property.Name}")
            .ToArray();

        offenders.Should().BeEmpty(
            "an aggregate with a public setter can be mutated without passing through its invariants");
    }

    /// <remarks>
    /// The mirror of the rule above for entities inside an aggregate: a
    /// <c>JobPhoto</c> with a public setter could be edited by anyone holding a
    /// reference to it, bypassing the root that owns it.
    /// </remarks>
    [Fact]
    public void Entities_ShouldNotExposePublicSetters()
    {
        var offenders = JobsDomain
            .GetTypes()
            .Where(type => type.IsSubclassOf(typeof(Entity)) && !type.IsSubclassOf(typeof(AggregateRoot)))
            .SelectMany(type => type.GetProperties())
            .Where(property => property.SetMethod is { IsPublic: true })
            .Select(property => $"{property.DeclaringType?.Name}.{property.Name}")
            .ToArray();

        offenders.Should().BeEmpty("entities are modified through their aggregate root, never directly");
    }

    /// <remarks>
    /// Value objects derive their equality from <see cref="ValueObject"/>'s
    /// template method. A value object that overrode <c>Equals</c> itself would
    /// have opted out of the one implementation that cannot forget a field.
    /// </remarks>
    [Fact]
    public void ValueObjects_ShouldNotOverrideEqualsThemselves()
    {
        var offenders = JobsDomain
            .GetTypes()
            .Where(type => type.IsSubclassOf(typeof(ValueObject)))
            .Where(type => type.GetMethod(nameof(Equals), [typeof(object)])?.DeclaringType == type)
            .Select(type => type.Name)
            .ToArray();

        offenders.Should().BeEmpty(
            "equality is defined once in ValueObject; overriding it per type reintroduces the bug it prevents");
    }

    /* ---------------------------------------------------------------------- */
    /* Presentation                                                           */
    /* ---------------------------------------------------------------------- */

    /// <remarks>
    /// Endpoints are discovered by the host through the <c>IEndpoint</c>
    /// interface, so none of them needs to be public. Keeping them internal is
    /// what allows a route's implementation to stay a module-private detail.
    /// </remarks>
    [Fact]
    public void Endpoints_ShouldBeInternalAndSealed()
        => ShouldHold(
            Types.InAssembly(JobsPresentation)
                .That().ImplementInterface(typeof(JobTracker.Common.Presentation.Endpoints.IEndpoint))
                .Should().NotBePublic().And().BeSealed()
                .GetResult(),
            "endpoints are registered by discovery, so nothing should reference one by name");
}
