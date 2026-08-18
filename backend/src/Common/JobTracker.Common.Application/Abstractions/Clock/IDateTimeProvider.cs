namespace JobTracker.Common.Application.Abstractions.Clock;

/// <summary>
/// The current instant, as a dependency rather than an ambient global.
/// </summary>
/// <remarks>
/// <para>
/// "A job cannot be scheduled in the past" is only testable if "now" can be
/// controlled. With <c>DateTime.UtcNow</c> called directly inside the aggregate,
/// the test for that invariant has to pick a date far enough in the future to
/// stay valid — which makes it a test that passes today and fails in 2031, or a
/// test that sleeps.
/// </para>
/// <para>
/// This is the textbook Dependency Inversion example in this codebase: the
/// domain rule depends on an abstraction it owns, and the system clock is an
/// implementation detail supplied from the outside.
/// </para>
/// </remarks>
public interface IDateTimeProvider
{
    DateTime UtcNow { get; }
}
