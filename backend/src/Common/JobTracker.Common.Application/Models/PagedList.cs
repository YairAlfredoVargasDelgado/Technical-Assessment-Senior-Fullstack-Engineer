namespace JobTracker.Common.Application.Models;

/// <summary>
/// One page of results together with the cursor needed to fetch the next.
/// </summary>
/// <remarks>
/// <para>
/// There is no <c>TotalCount</c> and no <c>PageNumber</c>, and their absence is
/// the design. Both require the database to count or skip rows that will not be
/// returned: <c>OFFSET 100000</c> makes Postgres walk and discard a hundred
/// thousand rows, and <c>COUNT(*)</c> over a filtered set is a second full scan.
/// Both costs grow with the size of the table rather than the size of the page.
/// </para>
/// <para>
/// Keyset ("cursor") pagination asks instead for "the next N rows after this
/// one", which an index can satisfy by seeking directly to the position. It is
/// also stable under concurrent writes: a row inserted while the user pages does
/// not shift every subsequent page by one, so no record is skipped or shown
/// twice. See <c>database/queries/search-jobs.sql</c>.
/// </para>
/// </remarks>
/// <param name="Items">The rows in this page.</param>
/// <param name="NextCursor">Opaque cursor for the following page; <c>null</c> at the end.</param>
/// <param name="HasNextPage">Whether another page exists.</param>
public sealed record PagedList<TItem>(
    IReadOnlyList<TItem> Items,
    string? NextCursor,
    bool HasNextPage)
{
    public static PagedList<TItem> Empty() => new([], null, false);

    /// <summary>
    /// Builds a page from a batch deliberately fetched with one extra row.
    /// </summary>
    /// <remarks>
    /// Requesting <c>pageSize + 1</c> rows and discarding the surplus answers
    /// "is there another page?" without a second query — the presence of the
    /// extra row <i>is</i> the answer.
    /// </remarks>
    public static PagedList<TItem> From(
        IReadOnlyList<TItem> fetched,
        int pageSize,
        Func<TItem, string> cursorSelector)
    {
        var hasNextPage = fetched.Count > pageSize;
        var items = hasNextPage ? fetched.Take(pageSize).ToArray() : fetched;

        var nextCursor = hasNextPage && items.Count > 0
            ? cursorSelector(items[^1])
            : null;

        return new PagedList<TItem>(items, nextCursor, hasNextPage);
    }
}
