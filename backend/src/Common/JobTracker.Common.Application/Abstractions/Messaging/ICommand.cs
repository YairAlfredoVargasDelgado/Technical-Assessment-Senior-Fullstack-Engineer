using JobTracker.Common.Domain.Results;

using MediatR;

namespace JobTracker.Common.Application.Abstractions.Messaging;

/// <summary>
/// An intent to change state, producing <typeparamref name="TResponse"/> on success.
/// </summary>
/// <remarks>
/// <para>
/// This is the GoF <b>Command</b> pattern and the write half of CQRS: a request
/// is an object, which is what lets cross-cutting concerns (validation, logging,
/// transactions) be applied uniformly by a pipeline instead of being repeated
/// inside every handler.
/// </para>
/// <para>
/// There is deliberately no non-generic <c>ICommand</c>. A second abstraction
/// whose only difference is "returns nothing" would double the handler
/// interfaces for no gain — commands with no meaningful result use
/// <c>ICommand&lt;Unit&gt;</c>, which is what MediatR already models.
/// </para>
/// </remarks>
public interface ICommand<TResponse> : IRequest<Result<TResponse>>
    where TResponse : notnull;
