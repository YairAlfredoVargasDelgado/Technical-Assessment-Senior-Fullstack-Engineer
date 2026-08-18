using System.Globalization;

using JobTracker.Common.Domain.Abstractions;
using JobTracker.Common.Domain.Results;

namespace JobTracker.Modules.Billing.Domain.Invoices;

/// <summary>
/// A bill raised for completed work: the aggregate root of the Billing module.
/// </summary>
/// <remarks>
/// <para>
/// <b>Note what is absent.</b> There is no reference to <c>Job</c>, no
/// <c>JobStatus</c>, no navigation into the Jobs schema — only a
/// <see cref="JobId"/>, which is an opaque identifier here. Billing knows that
/// work was completed and what it should charge for it; it does not know what a
/// job is. That is what a bounded context boundary looks like when it is real
/// rather than aspirational, and it is why Jobs can restructure its domain
/// without a single change in this module.
/// </para>
/// </remarks>
public sealed class Invoice : AggregateRoot
{
    private Invoice(
        Guid id,
        Guid organizationId,
        Guid customerId,
        Guid jobId,
        Money total,
        string idempotencyKey,
        DateTime issuedAtUtc)
        : base(id)
    {
        OrganizationId = organizationId;
        CustomerId = customerId;
        JobId = jobId;
        Total = total;
        IdempotencyKey = idempotencyKey;
        IssuedAtUtc = issuedAtUtc;
    }

    /// <summary>Required by EF Core's materialiser.</summary>
    private Invoice()
    {
        Total = null!;
        IdempotencyKey = string.Empty;
    }

    public Guid OrganizationId { get; private init; }

    public Guid CustomerId { get; private init; }

    /// <summary>The completed job this bills for — an identifier, not a reference.</summary>
    public Guid JobId { get; private init; }

    public Money Total { get; private init; }

    /// <summary>
    /// The natural key of the business fact this invoice was raised for.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <b>Business-level idempotency, and why it is not redundant.</b> The outbox
    /// already records which handlers processed which message, so a redelivery of
    /// the <i>same message</i> is skipped. This key defends something different:
    /// the same business fact arriving by another route — a manual replay, a
    /// backfill, an operator re-running a batch, a second event emitted after a
    /// bug fix. The outbox ledger cannot help there, because it is a different
    /// message.
    /// </para>
    /// <para>
    /// Enforced by a unique constraint on the column rather than by a
    /// "does it exist?" check in the handler. A check-then-insert is a race: two
    /// concurrent deliveries both find nothing and both insert. The database
    /// rejecting the second one is the only formulation that holds under
    /// concurrency.
    /// </para>
    /// </remarks>
    public string IdempotencyKey { get; private init; }

    public DateTime IssuedAtUtc { get; private init; }

    /// <summary>
    /// Builds the idempotency key for a completed job.
    /// </summary>
    /// <remarks>
    /// <para>
    /// <c>JobId + CompletedAtUtc</c>, as specified. The job identifier alone would
    /// be wrong: a job that is completed, re-opened by a correction, and completed
    /// again is genuinely two billable events, and keying on the identifier would
    /// silently drop the second.
    /// </para>
    /// <para>
    /// The timestamp is rendered round-trip ("O") so the key is byte-identical for
    /// the same instant regardless of the machine's locale or time zone — a
    /// locale-formatted key would differ between servers and defeat the whole
    /// mechanism.
    /// </para>
    /// </remarks>
    public static string BuildIdempotencyKey(Guid jobId, DateTime completedAtUtc)
        => string.Create(
            CultureInfo.InvariantCulture,
            $"job-completed:{jobId:N}:{completedAtUtc.ToUniversalTime():O}");

    public static Result<Invoice> IssueForCompletedJob(
        Guid organizationId,
        Guid customerId,
        Guid jobId,
        Money total,
        DateTime completedAtUtc,
        DateTime utcNow)
    {
        ArgumentNullException.ThrowIfNull(total);

        var idempotencyKey = BuildIdempotencyKey(jobId, completedAtUtc);

        return string.IsNullOrWhiteSpace(idempotencyKey)
            ? Result.Failure<Invoice>(InvoiceErrors.IdempotencyKeyRequired)
            : Result.Success(new Invoice(
                Guid.NewGuid(),
                organizationId,
                customerId,
                jobId,
                total,
                idempotencyKey,
                utcNow));
    }
}
