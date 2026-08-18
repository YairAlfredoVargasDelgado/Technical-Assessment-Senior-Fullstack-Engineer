namespace JobTracker.Common.Domain.Results;

/// <summary>
/// A validation failure that carries every individual rule violation.
/// </summary>
/// <remarks>
/// A single <see cref="Error"/> would force the API to report one broken field
/// at a time, so a client with three bad inputs would need three round trips to
/// discover them. Collecting them means one response describes the whole
/// problem, which is also what RFC 9457 <c>ProblemDetails</c> expects.
/// </remarks>
public sealed record ValidationError(IReadOnlyCollection<Error> Errors)
    : Error(Code: "Validation.General", Description: "One or more validation errors occurred.", Type: ErrorType.Validation);
