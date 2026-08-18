using FluentValidation;

namespace JobTracker.Modules.Jobs.Application.Jobs.CancelJob;

internal sealed class CancelJobCommandValidator : AbstractValidator<CancelJobCommand>
{
    public CancelJobCommandValidator()
    {
        RuleFor(command => command.JobId).NotEmpty();

        // A cancellation reason is an audit record a human will read months
        // later, so an empty or one-character reason is worse than useless.
        RuleFor(command => command.Reason)
            .NotEmpty()
            .MinimumLength(3)
            .MaximumLength(500);
    }
}
