namespace JobTracker.Common.Domain.Results;

/// <summary>
/// Lets generic code construct a failed result of a type it only knows as a
/// type parameter.
/// </summary>
/// <remarks>
/// <para>
/// A MediatR pipeline behaviour is generic over <c>TResponse</c>. When
/// validation fails it must return a failed <c>TResponse</c> — but
/// <c>Result.Failure&lt;Guid&gt;(error)</c> cannot be written without knowing
/// that <c>TResponse</c> is <c>Result&lt;Guid&gt;</c>.
/// </para>
/// <para>
/// The conventional workaround is reflection: <c>MakeGenericType</c>,
/// <c>GetMethod</c>, <c>Invoke</c>, and an unchecked cast. That is slow on every
/// failed request, silently breaks under trimming, and turns a typo into a
/// runtime <c>NullReferenceException</c>. A static abstract interface member
/// (C# 11) expresses the same thing at compile time: constrain
/// <c>TResponse</c> to this interface and call <c>TResponse.CreateFailure(...)</c>
/// directly.
/// </para>
/// </remarks>
/// <typeparam name="TSelf">The implementing type — the curiously recurring pattern.</typeparam>
public interface IFailureFactory<out TSelf>
{
    static abstract TSelf CreateFailure(Error error);
}
