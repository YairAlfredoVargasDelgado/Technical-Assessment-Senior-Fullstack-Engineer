using FluentValidation;

using JobTracker.Modules.Jobs.Domain.Jobs;

namespace JobTracker.Modules.Jobs.Application.Jobs.SearchJobs;

/// <summary>
/// Guards the search parameters.
/// </summary>
/// <remarks>
/// The upper bound on <c>Limit</c> is the one that matters operationally:
/// without it a single request for a million rows turns a keyset-paginated
/// endpoint back into a full table scan.
/// </remarks>
internal sealed class SearchJobsQueryValidator : AbstractValidator<SearchJobsQuery>
{
    public SearchJobsQueryValidator()
    {
        RuleFor(query => query.Limit)
            .InclusiveBetween(1, JobSearchCriteria.MaxLimit);

        RuleFor(query => query.SearchTerm)
            .MaximumLength(200)
            .When(query => query.SearchTerm is not null);

        RuleFor(query => query)
            .Must(query => query.ScheduledFromUtc is null
                           || query.ScheduledToUtc is null
                           || query.ScheduledFromUtc <= query.ScheduledToUtc)
            .WithName(nameof(SearchJobsQuery.ScheduledFromUtc))
            .WithMessage("The start of the date range must not be after its end.");

        // A cursor the server did not issue is rejected here rather than being
        // silently treated as "start from the beginning", which would show the
        // user page one again and look like a bug in the infinite scroll.
        RuleFor(query => query.Cursor)
            .Must(cursor => JobCursorCodec.Decode(cursor) is not null)
            .When(query => !string.IsNullOrWhiteSpace(query.Cursor))
            .WithMessage("The cursor is not a value issued by this API.");
    }
}
