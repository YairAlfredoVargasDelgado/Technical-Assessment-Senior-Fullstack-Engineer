using JobTracker.Common.Domain.Results;

using MediatR;

namespace JobTracker.Common.Application.Abstractions.Messaging;

/// <summary>
/// A request for data that must not change state.
/// </summary>
/// <remarks>
/// Separating this from <see cref="ICommand{TResponse}"/> is what allows the two
/// sides to be optimised independently: commands load aggregates through the
/// repository so invariants are enforced, while queries project straight to a
/// response type with no change tracking and no aggregate materialisation.
/// </remarks>
public interface IQuery<TResponse> : IRequest<Result<TResponse>>
    where TResponse : notnull;
