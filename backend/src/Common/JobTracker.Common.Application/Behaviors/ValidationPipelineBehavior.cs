using FluentValidation;

using JobTracker.Common.Domain.Results;

using MediatR;

namespace JobTracker.Common.Application.Behaviors;

/// <summary>
/// Runs every registered FluentValidation validator before a request reaches its
/// handler, and converts any violations into a failed <c>Result</c>.
/// </summary>
/// <remarks>
/// <para>
/// This exists to delete a block of code from every handler in the system. The
/// alternative is the same six lines — resolve validator, run it, check
/// <c>IsValid</c>, build a failure — copied into each of them, where the one
/// handler that omits it is indistinguishable from the ones that did not need it.
/// Here it is written once and applies by construction. Adding a validator is
/// enough to activate it; the handler is never edited.
/// </para>
/// <para>
/// <b>What this does NOT validate.</b> Pipeline validation covers the shape of
/// the input: required fields, string lengths, well-formed identifiers. Business
/// invariants — "a job cannot be scheduled in the past", "only a scheduled job
/// may start" — live in the aggregate and nowhere else. Keeping the two apart is
/// what prevents the same rule being written twice and drifting; a rule
/// duplicated into a validator will silently disagree with the aggregate the
/// first time either is changed.
/// </para>
/// <para>
/// Structurally this is the GoF <b>Decorator</b> pattern: the behaviour wraps the
/// handler and adds responsibility without the handler participating, which is
/// Open/Closed applied to cross-cutting concerns.
/// </para>
/// </remarks>
public sealed class ValidationPipelineBehavior<TRequest, TResponse>(
    IEnumerable<IValidator<TRequest>> validators)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
    where TResponse : Result, IFailureFactory<TResponse>
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        // Materialised once: `IEnumerable<T>` from the container may be a lazy
        // resolution, and it is enumerated twice below.
        var applicable = validators as IReadOnlyList<IValidator<TRequest>> ?? [.. validators];

        if (applicable.Count == 0)
        {
            return await next();
        }

        var context = new ValidationContext<TRequest>(request);

        var results = await Task.WhenAll(
            applicable.Select(validator => validator.ValidateAsync(context, cancellationToken)));

        var failures = results
            .SelectMany(result => result.Errors)
            .Where(failure => failure is not null)
            .Select(failure => Error.Validation(failure.PropertyName, failure.ErrorMessage))
            .ToArray();

        if (failures.Length == 0)
        {
            return await next();
        }

        // `TResponse.CreateFailure` is a static abstract interface member. It is
        // what lets this generic method build a failed `Result<Guid>` — or a
        // failed `Result<PagedList<JobResponse>>` — with no reflection and no
        // cast. See `IFailureFactory<TSelf>`.
        return TResponse.CreateFailure(new ValidationError(failures));
    }
}
