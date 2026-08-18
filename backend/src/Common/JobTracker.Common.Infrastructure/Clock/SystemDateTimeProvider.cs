using JobTracker.Common.Application.Abstractions.Clock;

namespace JobTracker.Common.Infrastructure.Clock;

/// <summary>
/// The system clock.
/// </summary>
/// <remarks>
/// The entire implementation of <see cref="IDateTimeProvider"/> in production —
/// which is the point. The interface exists so that "a job cannot be scheduled in
/// the past" is a rule a test can pin to a fixed instant, and this class is the
/// one place the real clock is read.
/// </remarks>
public sealed class SystemDateTimeProvider : IDateTimeProvider
{
    public DateTime UtcNow => DateTime.UtcNow;
}
