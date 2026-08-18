namespace JobTracker.Common.Infrastructure.Outbox;

/// <summary>
/// Records that one handler has already processed one outbox message.
/// </summary>
/// <remarks>
/// <para>
/// This is the <b>dispatch-level</b> half of idempotency. The outbox guarantees
/// at-least-once delivery, so a message will eventually be published twice — the
/// worker can crash after the handlers ran but before the row was marked
/// processed. On the redelivery, every handler that already completed is found in
/// this table and skipped.
/// </para>
/// <para>
/// <b>Why the business layer still needs its own key.</b> This table protects
/// against replay of a <i>specific message</i>. It does not protect against the
/// same business fact arriving by another route — a manual re-run, a backfill, a
/// second event carrying the same completion. That is why the Billing handler
/// additionally derives an idempotency key from <c>JobId + CompletedAtUtc</c> and
/// enforces it with a unique constraint on the invoice itself. The two are not
/// redundant: they defend different failure modes, and only the second one
/// survives the outbox table being truncated.
/// </para>
/// <para>
/// The primary key is the pair, which is what makes the check a single indexed
/// lookup and makes a concurrent double-insert fail loudly rather than silently
/// duplicating work.
/// </para>
/// </remarks>
public sealed class OutboxMessageConsumer
{
    public required Guid OutboxMessageId { get; init; }

    /// <summary>The handler's type name — the unit of "already done".</summary>
    public required string Name { get; init; }
}
