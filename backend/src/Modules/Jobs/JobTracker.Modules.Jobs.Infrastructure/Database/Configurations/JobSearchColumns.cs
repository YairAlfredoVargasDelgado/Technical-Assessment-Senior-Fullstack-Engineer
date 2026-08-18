namespace JobTracker.Modules.Jobs.Infrastructure.Database.Configurations;

/// <summary>
/// Names of the generated columns that exist for querying only.
/// </summary>
/// <remarks>
/// They are mapped as EF <b>shadow properties</b>: real columns in the database,
/// absent from the <c>Job</c> class. A full-text vector and a pagination sort key
/// are storage concerns invented to make particular query plans possible, and
/// putting them on the aggregate would mean the domain carried fields no business
/// rule ever reads — and that a unit test of the domain had to invent values for
/// them.
/// <para>
/// The names live here rather than as string literals at each use site so a
/// rename is one edit and a typo is a compile error instead of a runtime
/// "property not found".
/// </para>
/// </remarks>
internal static class JobSearchColumns
{
    /// <summary>
    /// Stored <c>tsvector</c> over title and description.
    /// </summary>
    /// <remarks>
    /// Generated and stored rather than computed per query: a GIN index can only
    /// be built on a stored column or a fixed expression, and re-deriving the
    /// vector for every row on every search is exactly the full scan the index
    /// exists to avoid.
    /// </remarks>
    public const string SearchVector = "SearchVector";

    /// <summary>
    /// Always-present ordering key: the scheduled date, or <c>infinity</c>.
    /// </summary>
    /// <remarks>
    /// Keyset pagination needs a total order over non-null values. Deriving this
    /// in the database — rather than in the query with <c>COALESCE</c> — is what
    /// makes it directly indexable: a parameterised <c>COALESCE</c> in the
    /// <c>WHERE</c> clause cannot match an expression index.
    /// </remarks>
    public const string SortKey = "SortKey";
}
