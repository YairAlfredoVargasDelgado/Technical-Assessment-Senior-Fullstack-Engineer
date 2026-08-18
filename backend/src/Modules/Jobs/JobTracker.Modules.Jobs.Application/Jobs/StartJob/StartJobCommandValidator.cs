using FluentValidation;

namespace JobTracker.Modules.Jobs.Application.Jobs.StartJob;

internal sealed class StartJobCommandValidator : AbstractValidator<StartJobCommand>
{
    public StartJobCommandValidator() => RuleFor(command => command.JobId).NotEmpty();
}
