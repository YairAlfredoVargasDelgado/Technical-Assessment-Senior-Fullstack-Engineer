using FluentValidation;

namespace JobTracker.Modules.Jobs.Application.Jobs.CompleteJob;

/// <summary>
/// Shape checks only.
/// </summary>
/// <remarks>
/// That the job must be in progress is a state rule, and state rules belong to
/// the aggregate — a validator cannot see the job's state without loading it,
/// and loading it here would put a second, unsynchronised read in front of every
/// completion.
/// </remarks>
internal sealed class CompleteJobCommandValidator : AbstractValidator<CompleteJobCommand>
{
    public CompleteJobCommandValidator()
    {
        RuleFor(command => command.JobId).NotEmpty();

        RuleFor(command => command.SignatureUrl)
            .NotEmpty()
            .MaximumLength(2048)
            .Must(BeAnAbsoluteHttpUri)
            .WithMessage("The signature URL must be an absolute http(s) URI.");
    }

    private static bool BeAnAbsoluteHttpUri(string value)
        => Uri.TryCreate(value, UriKind.Absolute, out var uri)
           && (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);
}
