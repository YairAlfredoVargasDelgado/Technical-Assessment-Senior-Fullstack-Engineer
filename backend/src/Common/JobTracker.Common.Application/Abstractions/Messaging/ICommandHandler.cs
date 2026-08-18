using JobTracker.Common.Domain.Results;

using MediatR;

namespace JobTracker.Common.Application.Abstractions.Messaging;

/// <summary>Handles exactly one <see cref="ICommand{TResponse}"/>.</summary>
/// <remarks>
/// One handler per command is Single Responsibility applied at the use-case
/// level: the reason to change a handler is a change to that one use case. It is
/// also what keeps handlers small enough that their dependencies are honest —
/// a service class accumulating twelve methods hides which of its twelve
/// dependencies any given call actually needs.
/// </remarks>
public interface ICommandHandler<in TCommand, TResponse> : IRequestHandler<TCommand, Result<TResponse>>
    where TCommand : ICommand<TResponse>
    where TResponse : notnull;
