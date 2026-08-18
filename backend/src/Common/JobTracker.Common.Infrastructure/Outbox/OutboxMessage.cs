namespace JobTracker.Common.Infrastructure.Outbox;

/// <summary>
/// A message queued for delivery, stored in the same database — and the same
/// transaction — as the state change that produced it.
/// </summary>
/// <remarks>
/// <para>
/// <b>The problem it solves.</b> Completing a job and telling Billing about it
/// are two writes to two systems. Without a shared transaction one of them can
/// succeed alone: the job is completed and no invoice is ever raised, or an
/// invoice is raised for a completion that rolled back. No ordering of the two
/// calls fixes this — it is the dual-write problem, and retries only change which
/// failure you get.
/// </para>
/// <para>
/// <b>How this fixes it.</b> The message is a row in the same database. The state
/// change and the row commit atomically, so after the commit the intent to
/// publish is durable. A background worker then reads unprocessed rows and
/// publishes them, retrying until it succeeds.
/// </para>
/// <para>
/// <b>What that buys, and what it costs.</b> Delivery becomes <b>at-least-once</b>:
/// the message cannot be lost, because it is only marked processed after the
/// handlers returned. It can, however, be delivered twice — the worker may crash
/// after handling and before marking. Exactly-once delivery is not available;
/// exactly-once <i>effect</i> is, and it is the consumer's job to provide it by
/// being idempotent. See <see cref="OutboxMessageConsumer"/> and the Billing
/// handler's business-level idempotency key.
/// </para>
/// </remarks>
public sealed class OutboxMessage
{
    public Guid Id { get; init; }

    /// <summary>
    /// Assembly-qualified CLR type name, used to rehydrate <see cref="Content"/>.
    /// </summary>
    /// <remarks>
    /// This ties stored rows to type names, which is a real constraint: renaming
    /// or moving an event type strands the messages already queued under the old
    /// name. The migration path is to keep the old type until the outbox has
    /// drained, which is cheap and explicit — as opposed to a bespoke type map,
    /// which is a second registry to keep in step with the code.
    /// </remarks>
    public required string Type { get; init; }

    /// <summary>The serialised event, stored as <c>jsonb</c>.</summary>
    public required string Content { get; init; }

    /// <summary>When the fact occurred — not when it was written.</summary>
    public DateTime OccurredOnUtc { get; init; }

    /// <summary>When processing completed. <c>null</c> means still pending.</summary>
    public DateTime? ProcessedOnUtc { get; set; }

    /// <summary>The last failure, kept for diagnosis. <c>null</c> when healthy.</summary>
    public string? Error { get; set; }
}
