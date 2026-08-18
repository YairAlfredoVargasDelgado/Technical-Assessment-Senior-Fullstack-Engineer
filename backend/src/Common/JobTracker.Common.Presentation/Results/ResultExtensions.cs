using JobTracker.Common.Domain.Results;

using Microsoft.AspNetCore.Http;

namespace JobTracker.Common.Presentation.Results;

/// <summary>
/// Translates a domain <see cref="Result"/> into an HTTP response.
/// </summary>
/// <remarks>
/// <para>
/// <b>The single reason <c>ErrorType</c> exists.</b> Without it, every endpoint
/// would carry its own <c>if (error.Code == "Job.NotFound") return 404;</c> ladder
/// — the same decision restated per route, drifting apart as routes are added,
/// with the newest endpoint inevitably returning 400 for a missing resource. Here
/// the mapping is written once and every endpoint inherits it.
/// </para>
/// <para>
/// The payload is RFC 9457 <c>ProblemDetails</c>, which is what
/// <c>Results.Problem</c> emits — a standard shape clients can parse generically
/// rather than a bespoke error envelope per API.
/// </para>
/// <para>
/// Validation failures are expanded into the <c>errors</c> extension so a client
/// can attach messages to the fields that produced them, rather than showing one
/// combined string.
/// </para>
/// </remarks>
public static class ResultExtensions
{
    public static IResult ToProblemDetails(this Result result)
    {
        if (result.IsSuccess)
        {
            throw new InvalidOperationException("A successful result cannot be converted to a problem response.");
        }

        return Microsoft.AspNetCore.Http.Results.Problem(
            statusCode: StatusCodeFor(result.Error.Type),
            title: TitleFor(result.Error.Type),
            type: TypeUriFor(result.Error.Type),
            extensions: BuildExtensions(result.Error));
    }

    /// <summary>
    /// Renders a successful result through <paramref name="onSuccess"/>, or the
    /// failure as ProblemDetails.
    /// </summary>
    /// <remarks>
    /// Keeps the "did it work?" branch out of every endpoint body, so an endpoint
    /// reads as one expression: dispatch, then map.
    /// </remarks>
    public static IResult Match<TValue>(this Result<TValue> result, Func<TValue, IResult> onSuccess)
        where TValue : notnull
        => result.IsSuccess ? onSuccess(result.Value) : ((Result)result).ToProblemDetails();

    private static int StatusCodeFor(ErrorType errorType) => errorType switch
    {
        ErrorType.Validation => StatusCodes.Status400BadRequest,
        ErrorType.NotFound => StatusCodes.Status404NotFound,

        // 409, not 400. A rejected state transition is not a malformed request —
        // the request was well-formed and would have been valid a moment ago.
        // The distinction tells a client whether retrying could ever help.
        ErrorType.Conflict => StatusCodes.Status409Conflict,

        ErrorType.Forbidden => StatusCodes.Status403Forbidden,
        _ => StatusCodes.Status500InternalServerError,
    };

    private static string TitleFor(ErrorType errorType) => errorType switch
    {
        ErrorType.Validation => "One or more validation errors occurred",
        ErrorType.NotFound => "Resource not found",
        ErrorType.Conflict => "The request conflicts with the current state",
        ErrorType.Forbidden => "Access denied",
        _ => "An unexpected error occurred",
    };

    /// <summary>
    /// A stable URI identifying the problem class, as RFC 9457 recommends.
    /// </summary>
    private static string TypeUriFor(ErrorType errorType) => errorType switch
    {
        ErrorType.Validation => "https://tools.ietf.org/html/rfc9110#section-15.5.1",
        ErrorType.NotFound => "https://tools.ietf.org/html/rfc9110#section-15.5.5",
        ErrorType.Conflict => "https://tools.ietf.org/html/rfc9110#section-15.5.10",
        ErrorType.Forbidden => "https://tools.ietf.org/html/rfc9110#section-15.5.4",
        _ => "https://tools.ietf.org/html/rfc9110#section-15.6.1",
    };

    private static Dictionary<string, object?> BuildExtensions(Error error)
    {
        var extensions = new Dictionary<string, object?>
        {
            // The machine-readable identifier. Clients branch on this; they must
            // never branch on the human-readable detail, which may be reworded.
            ["code"] = error.Code,
            ["detail"] = error.Description,
        };

        if (error is ValidationError validationError)
        {
            // Grouped by field so a form can highlight each offending input
            // rather than showing one merged sentence.
            extensions["errors"] = validationError.Errors
                .GroupBy(item => item.Code)
                .ToDictionary(
                    group => group.Key,
                    group => group.Select(item => item.Description).ToArray());
        }

        return extensions;
    }
}
