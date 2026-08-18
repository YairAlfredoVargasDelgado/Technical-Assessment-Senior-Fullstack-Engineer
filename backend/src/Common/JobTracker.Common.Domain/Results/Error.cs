namespace JobTracker.Common.Domain.Results;

/// <summary>
/// Why an operation failed, in terms the domain understands.
/// </summary>
/// <remarks>
/// <para>
/// <see cref="Type"/> is the field that earns this record its place. Without it,
/// every endpoint would need its own mapping from "which error is this?" to an
/// HTTP status code — the same decision, restated once per route, drifting
/// apart as routes are added. With it, one translator in the presentation layer
/// maps <see cref="ErrorType"/> to a status code and every endpoint inherits the
/// behaviour.
/// </para>
/// <para>
/// <see cref="Code"/> is a stable, machine-readable identifier
/// (<c>"Job.NotFound"</c>). Clients branch on it; they must never branch on
/// <see cref="Description"/>, which is prose and may be reworded or localised.
/// </para>
/// </remarks>
public record Error(string Code, string Description, ErrorType Type)
{
    /// <summary>The absence of an error. Carried by every successful <c>Result</c>.</summary>
    public static readonly Error None = new(string.Empty, string.Empty, ErrorType.Failure);

    /// <summary>Guard failure: a value that must not be null was.</summary>
    public static readonly Error NullValue = new(
        "General.NullValue",
        "A required value was null.",
        ErrorType.Failure);

    public static Error Failure(string code, string description) => new(code, description, ErrorType.Failure);

    public static Error Validation(string code, string description) => new(code, description, ErrorType.Validation);

    public static Error NotFound(string code, string description) => new(code, description, ErrorType.NotFound);

    /// <summary>The request conflicts with the current state — a rejected state transition, a duplicate.</summary>
    public static Error Conflict(string code, string description) => new(code, description, ErrorType.Conflict);

    public static Error Forbidden(string code, string description) => new(code, description, ErrorType.Forbidden);
}

/// <summary>
/// The category of a failure, which is what the transport layer translates into
/// a status code.
/// </summary>
public enum ErrorType
{
    Failure = 0,
    Validation = 1,
    NotFound = 2,
    Conflict = 3,
    Forbidden = 4,
}
