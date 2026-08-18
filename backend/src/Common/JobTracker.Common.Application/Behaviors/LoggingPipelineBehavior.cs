using JobTracker.Common.Domain.Results;

using MediatR;

using Microsoft.Extensions.Logging;

namespace JobTracker.Common.Application.Behaviors;

/// <summary>
/// Logs the outcome of every request, at a level that reflects whether it
/// succeeded.
/// </summary>
/// <remarks>
/// A failed <c>Result</c> never throws, so without this a rejected command is
/// indistinguishable from a successful one in the logs. Logging inside handlers
/// instead would repeat the same three lines across every use case and give each
/// one its own idea of what to log.
/// </remarks>
public sealed class LoggingPipelineBehavior<TRequest, TResponse>(
    ILogger<LoggingPipelineBehavior<TRequest, TResponse>> logger)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
    where TResponse : Result
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var requestName = typeof(TRequest).Name;

        logger.LogInformation("Handling {RequestName}", requestName);

        var response = await next();

        if (response.IsSuccess)
        {
            logger.LogInformation("Handled {RequestName} successfully", requestName);
            return response;
        }

        // Warning, not Error: a rejected business rule is an expected outcome of
        // a working system. Reserving Error for genuine faults is what keeps an
        // alerting rule on "Error" meaningful.
        logger.LogWarning(
            "{RequestName} failed with {ErrorCode}: {ErrorDescription}",
            requestName,
            response.Error.Code,
            response.Error.Description);

        return response;
    }
}
