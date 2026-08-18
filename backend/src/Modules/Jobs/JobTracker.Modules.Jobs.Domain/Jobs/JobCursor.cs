namespace JobTracker.Modules.Jobs.Domain.Jobs;

/// <summary>
/// A position in the job result set, for keyset pagination.
/// </summary>
/// <remarks>
/// <para>
/// Two components, both required.
/// </para>
/// <para>
/// <b>Why the tiebreaker.</b> Jobs are ordered by when they are due, and dates
/// are not unique — several jobs can be booked for the same morning. A cursor
/// carrying only the date would either skip the rest of that morning's jobs or
/// return them twice, depending on which comparison operator was used. The
/// identifier makes the ordering total, and therefore the cursor unambiguous.
/// </para>
/// <para>
/// <b>Why a sort key and not the scheduled date.</b> A draft has no scheduled
/// date. A nullable pagination key breaks keyset pagination outright: no
/// comparison operator gives a useful answer against <c>NULL</c>, so those rows
/// would vanish from every page after the first. The persistence layer therefore
/// derives an always-present key — the scheduled date, or <c>infinity</c> for
/// jobs that have none, which places unscheduled work at the end where it
/// belongs.
/// </para>
/// <para>
/// Encoding to and from an opaque string is a transport concern and lives in the
/// Application layer, so the domain type stays a plain, comparable value.
/// </para>
/// </remarks>
public sealed record JobCursor(DateTime SortKeyUtc, Guid Id);
