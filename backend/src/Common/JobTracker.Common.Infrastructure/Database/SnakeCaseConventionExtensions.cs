using System.Text;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace JobTracker.Common.Infrastructure.Database;

/// <summary>
/// Applies snake_case naming across an entire EF Core model.
/// </summary>
/// <remarks>
/// <para>
/// The alternative is <c>.HasColumnName("scheduled_date_utc")</c> on every
/// property of every entity — dozens of lines that carry no information, that
/// nobody reviews carefully, and where the one that is missing produces a column
/// named <c>ScheduledDateUtc</c> that only shows up when someone writes SQL by
/// hand against it.
/// </para>
/// <para>
/// Convention over configuration, applied once. Adding an entity gets the naming
/// for free; the only thing a configuration file then has to say is what is
/// genuinely specific to that entity.
/// </para>
/// <para>
/// Indexes and constraints are renamed too, not just columns. A model where the
/// columns are snake_case but the keys are <c>PK_Jobs</c> is worse than either
/// convention applied consistently, because it means neither can be relied on
/// when writing a migration by hand.
/// </para>
/// </remarks>
public static class SnakeCaseConventionExtensions
{
    public static ModelBuilder UseSnakeCaseNames(this ModelBuilder modelBuilder)
    {
        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            var tableName = entity.GetTableName();
            if (tableName is not null)
            {
                entity.SetTableName(ToSnakeCase(tableName));
            }

            var storeObject = StoreObjectIdentifier.Create(entity, StoreObjectType.Table);

            RenameColumns(entity.GetProperties(), storeObject);

            // Complex types are NOT returned by GetProperties(). A value object
            // mapped with ComplexProperty — Address, Money — has its members
            // flattened onto this table under names like "Address_Street", and
            // walking only GetProperties() leaves exactly those columns in
            // PascalCase. The result is a table where most columns are snake_case
            // and the value object's are not, which is worse than either
            // convention applied consistently.
            RenameComplexTypeColumns(entity.GetComplexProperties(), storeObject);

            foreach (var key in entity.GetKeys())
            {
                key.SetName(ToSnakeCase(key.GetName() ?? string.Empty));
            }

            foreach (var foreignKey in entity.GetForeignKeys())
            {
                foreignKey.SetConstraintName(ToSnakeCase(foreignKey.GetConstraintName() ?? string.Empty));
            }

            foreach (var index in entity.GetIndexes())
            {
                index.SetDatabaseName(ToSnakeCase(index.GetDatabaseName() ?? string.Empty));
            }
        }

        return modelBuilder;
    }

    private static void RenameColumns(
        IEnumerable<IMutableProperty> properties,
        StoreObjectIdentifier? storeObject)
    {
        foreach (var property in properties)
        {
            // Resolve the *current* column name rather than the property name:
            // by this point a flattened member already carries its owner's
            // prefix, and re-deriving from the property name alone would lose it.
            var columnName = storeObject.HasValue
                ? property.GetColumnName(storeObject.Value) ?? property.Name
                : property.Name;

            property.SetColumnName(ToSnakeCase(columnName));
        }
    }

    /// <summary>
    /// Renames the columns a complex type contributes, recursively.
    /// </summary>
    /// <remarks>
    /// Recursion matters because complex types nest: a value object containing
    /// another value object flattens to a two-level prefix, and a single-level
    /// walk would leave the inner one untouched.
    /// </remarks>
    private static void RenameComplexTypeColumns(
        IEnumerable<IMutableComplexProperty> complexProperties,
        StoreObjectIdentifier? storeObject)
    {
        foreach (var complexProperty in complexProperties)
        {
            var complexType = complexProperty.ComplexType;

            RenameColumns(complexType.GetProperties(), storeObject);
            RenameComplexTypeColumns(complexType.GetComplexProperties(), storeObject);
        }
    }

    /// <summary>
    /// Converts PascalCase, camelCase and already-underscored names to snake_case.
    /// </summary>
    /// <remarks>
    /// Runs of capitals are treated as one word, so <c>ZipCode</c> becomes
    /// <c>zip_code</c> and <c>JobURLId</c> becomes <c>job_url_id</c> rather than
    /// <c>job_u_r_l_id</c>. An underscore already present is preserved and never
    /// doubled, which is what makes the function safe to apply to a name it has
    /// already processed.
    /// </remarks>
    internal static string ToSnakeCase(string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return value;
        }

        var builder = new StringBuilder(value.Length + 8);

        for (var index = 0; index < value.Length; index++)
        {
            var current = value[index];

            if (current == '_')
            {
                if (builder.Length > 0 && builder[^1] != '_')
                {
                    builder.Append('_');
                }

                continue;
            }

            if (char.IsUpper(current))
            {
                var previous = index > 0 ? value[index - 1] : '\0';
                var next = index + 1 < value.Length ? value[index + 1] : '\0';

                var startsNewWord = index > 0
                                    && previous != '_'
                                    && (!char.IsUpper(previous) || (next != '\0' && char.IsLower(next)));

                if (startsNewWord && builder.Length > 0 && builder[^1] != '_')
                {
                    builder.Append('_');
                }

                builder.Append(char.ToLowerInvariant(current));
                continue;
            }

            builder.Append(current);
        }

        return builder.ToString();
    }
}
