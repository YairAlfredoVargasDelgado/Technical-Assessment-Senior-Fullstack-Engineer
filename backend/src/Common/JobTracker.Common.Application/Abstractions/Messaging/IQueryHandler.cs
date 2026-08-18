using JobTracker.Common.Domain.Results;

using MediatR;

namespace JobTracker.Common.Application.Abstractions.Messaging;

/// <summary>Handles exactly one <see cref="IQuery{TResponse}"/>.</summary>
public interface IQueryHandler<in TQuery, TResponse> : IRequestHandler<TQuery, Result<TResponse>>
    where TQuery : IQuery<TResponse>
    where TResponse : notnull;
