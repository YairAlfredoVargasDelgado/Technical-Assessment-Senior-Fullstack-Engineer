namespace JobTracker.Common.Infrastructure.Outbox;

/// <summary>How aggressively the outbox is drained.</summary>
/// <remarks>
/// Both values are trade-offs worth exposing rather than hard-coding.
/// <see cref="PollingIntervalSeconds"/> sets the floor on end-to-end latency: an
/// invoice cannot appear sooner than the next poll. <see cref="BatchSize"/> bounds
/// how much work one tick can hold open, and with it the length of the
/// transaction and the memory a single pass can consume.
/// </remarks>
public sealed class OutboxOptions
{
    public const string SectionName = "Outbox";

    public int PollingIntervalSeconds { get; init; } = 10;

    public int BatchSize { get; init; } = 20;
}
