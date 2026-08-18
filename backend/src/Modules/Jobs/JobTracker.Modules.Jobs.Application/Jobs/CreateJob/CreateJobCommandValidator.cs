using FluentValidation;

using JobTracker.Modules.Jobs.Domain.Jobs;

namespace JobTracker.Modules.Jobs.Application.Jobs.CreateJob;

/// <summary>
/// Validates the <i>shape</i> of a create-job request.
/// </summary>
/// <remarks>
/// <para>
/// <b>The line this validator does not cross.</b> It checks what can be checked
/// by looking at the request alone: presence, length, and that the optional
/// scheduling fields are supplied together. It does <b>not</b> check that the
/// date is in the future, even though that is a rule about this request — that
/// rule belongs to the <see cref="Job"/> aggregate, which owns it and enforces it
/// for every route into the system, including background jobs and future
/// endpoints that will never pass through this validator.
/// </para>
/// <para>
/// Duplicating it here would create two statements of one rule with no mechanism
/// keeping them in step. The first time someone relaxes the aggregate to allow
/// same-day booking, this validator would keep rejecting it, and the bug would
/// present as "the API says no but the domain says yes".
/// </para>
/// <para>
/// The length limits below are the exception, and deliberately reference the
/// aggregate's own constants rather than repeating the numbers.
/// </para>
/// </remarks>
internal sealed class CreateJobCommandValidator : AbstractValidator<CreateJobCommand>
{
    public CreateJobCommandValidator()
    {
        RuleFor(command => command.Title)
            .NotEmpty()
            .MaximumLength(Job.TitleMaxLength);

        RuleFor(command => command.Description)
            .MaximumLength(Job.DescriptionMaxLength);

        RuleFor(command => command.Street).NotEmpty().MaximumLength(300);
        RuleFor(command => command.City).NotEmpty().MaximumLength(150);
        RuleFor(command => command.State).NotEmpty().MaximumLength(100);
        RuleFor(command => command.ZipCode).NotEmpty().MaximumLength(20);

        RuleFor(command => command.CustomerId).NotEmpty();

        RuleFor(command => command.Latitude)
            .InclusiveBetween(-90, 90)
            .When(command => command.Latitude.HasValue);

        RuleFor(command => command.Longitude)
            .InclusiveBetween(-180, 180)
            .When(command => command.Longitude.HasValue);

        // A request carrying a date but no crew (or the reverse) is malformed,
        // not a draft. Reporting that as a validation error tells the caller what
        // they got wrong; silently creating a draft would not.
        RuleFor(command => command)
            .Must(command => command.ScheduledDateUtc.HasValue == command.AssigneeId.HasValue)
            .WithName(nameof(CreateJobCommand.ScheduledDateUtc))
            .WithMessage("A scheduled date and an assignee must be supplied together.");

        RuleFor(command => command.AssigneeId)
            .NotEmpty()
            .When(command => command.AssigneeId.HasValue);
    }
}
