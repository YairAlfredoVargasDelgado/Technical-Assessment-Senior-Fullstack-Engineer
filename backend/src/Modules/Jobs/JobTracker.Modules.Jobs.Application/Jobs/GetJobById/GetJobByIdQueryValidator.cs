using FluentValidation;

namespace JobTracker.Modules.Jobs.Application.Jobs.GetJobById;

internal sealed class GetJobByIdQueryValidator : AbstractValidator<GetJobByIdQuery>
{
    public GetJobByIdQueryValidator() => RuleFor(query => query.JobId).NotEmpty();
}
