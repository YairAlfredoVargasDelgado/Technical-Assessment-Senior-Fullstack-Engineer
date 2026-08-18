namespace JobTracker.Common.Domain.Results;

/// <summary>
/// The outcome of an operation that is expected to be able to fail.
/// </summary>
/// <remarks>
/// <para>
/// Exceptions model the <i>unexpected</i>. "This job is already completed" is
/// not unexpected — it is an ordinary outcome of a business rule, and one the
/// caller must handle. Returning it makes that obligation visible in the
/// signature; throwing it makes the obligation invisible and turns control flow
/// into an out-of-band jump that costs a stack unwind on a path the system takes
/// routinely.
/// </para>
/// <para>
/// The invariants below are enforced in the constructor rather than trusted:
/// a success carrying an error, or a failure carrying none, would leave every
/// consumer unable to rely on <see cref="IsSuccess"/>.
/// </para>
/// </remarks>
public class Result : IFailureFactory<Result>
{
    protected internal Result(bool isSuccess, Error error)
    {
        switch (isSuccess)
        {
            case true when error != Error.None:
                throw new InvalidOperationException("A successful result cannot carry an error.");
            case false when error == Error.None:
                throw new InvalidOperationException("A failed result must carry an error.");
        }

        IsSuccess = isSuccess;
        Error = error;
    }

    public bool IsSuccess { get; }

    public bool IsFailure => !IsSuccess;

    public Error Error { get; }

    public static Result Success() => new(true, Error.None);

    public static Result Failure(Error error) => new(false, error);

    public static Result<TValue> Success<TValue>(TValue value)
        where TValue : notnull
        => new(value, true, Error.None);

    public static Result<TValue> Failure<TValue>(Error error)
        where TValue : notnull
        => new(default, false, error);

    /// <summary>
    /// Lifts a possibly-null value into a result, failing with
    /// <see cref="Error.NullValue"/> when it is absent.
    /// </summary>
    public static Result<TValue> Create<TValue>(TValue? value)
        where TValue : class
        => value is not null ? Success(value) : Failure<TValue>(Error.NullValue);

    /// <inheritdoc cref="IFailureFactory{TSelf}.CreateFailure" />
    static Result IFailureFactory<Result>.CreateFailure(Error error) => Failure(error);
}

/// <summary>A <see cref="Result"/> that carries a value when it succeeds.</summary>
/// <remarks>
/// <typeparamref name="TValue"/> is constrained to <c>notnull</c> so that
/// <see cref="Value"/> is genuinely non-nullable to the compiler's flow
/// analysis. Without it every consumer of a successful result would face a
/// spurious "may be null" warning and would reach for <c>!</c> to silence it —
/// which is how a nullable-annotated codebase quietly stops meaning anything.
/// </remarks>
public sealed class Result<TValue> : Result, IFailureFactory<Result<TValue>>
    where TValue : notnull
{
    private readonly TValue? _value;

    // `internal`, not `protected internal`: the type is sealed, so there is
    // nothing to inherit the constructor. Only the factory methods on the
    // non-generic `Result` may construct one, which is what keeps the
    // success/error invariant impossible to bypass from outside this assembly.
    internal Result(TValue? value, bool isSuccess, Error error)
        : base(isSuccess, error)
        => _value = value;

    /// <summary>
    /// The produced value.
    /// </summary>
    /// <remarks>
    /// Throws rather than returning <c>default</c> on a failed result. Silently
    /// handing back <c>null</c> here would push the failure to a later, unrelated
    /// line — the exact debugging experience this type exists to prevent. Callers
    /// check <see cref="Result.IsSuccess"/> first; reaching this property on a
    /// failure is a programming error, and programming errors are what exceptions
    /// are for.
    /// </remarks>
    public TValue Value => IsSuccess
        ? _value!
        : throw new InvalidOperationException("The value of a failed result cannot be accessed.");

    /// <summary>Allows <c>return someValue;</c> from a method returning <c>Result&lt;T&gt;</c>.</summary>
    public static implicit operator Result<TValue>(TValue? value) => Create(value);

    private static Result<TValue> Create(TValue? value)
        => value is not null ? Success(value) : Failure<TValue>(Error.NullValue);

    /// <inheritdoc cref="IFailureFactory{TSelf}.CreateFailure" />
    static Result<TValue> IFailureFactory<Result<TValue>>.CreateFailure(Error error) => Failure<TValue>(error);
}
