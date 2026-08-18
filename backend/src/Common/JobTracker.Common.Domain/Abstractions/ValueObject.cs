namespace JobTracker.Common.Domain.Abstractions;

/// <summary>
/// An object defined entirely by its attributes: it has no identity, and two
/// instances with the same values <b>are</b> the same value.
/// </summary>
/// <remarks>
/// <para>
/// This is the GoF <b>Template Method</b> pattern. <see cref="Equals(object?)"/>
/// and <see cref="GetHashCode"/> are sealed algorithms defined once here; each
/// concrete value object supplies only the varying part — which of its fields
/// participate — through <see cref="GetAtomicValues"/>. Without this, every value
/// object in the system would carry its own hand-written equality override, and
/// the one that forgot a field would produce a bug that is invisible in review
/// and reproduces only when two nearly-identical addresses compare as equal.
/// </para>
/// <para>
/// A C# <c>record</c> gives structural equality for free, so why a base class?
/// Because a record's equality is positional and public, whereas a value object
/// needs to choose its own significant fields — <c>Address</c> may want equality
/// on the postal fields while ignoring cached coordinates — and because EF Core
/// owned types map more predictably from a class with a private constructor.
/// </para>
/// </remarks>
public abstract class ValueObject : IEquatable<ValueObject>
{
    /// <summary>
    /// The fields that define this value's identity, in a stable order.
    /// </summary>
    /// <remarks>
    /// Order matters: it feeds <see cref="GetHashCode"/>, so reordering the
    /// yields changes hash codes across process boundaries. Add new fields at
    /// the end.
    /// </remarks>
    protected abstract IEnumerable<object?> GetAtomicValues();

    public bool Equals(ValueObject? other)
    {
        if (other is null)
        {
            return false;
        }

        // Two value objects of different types are never equal, even if their
        // atomic values happen to line up. A `Money(10, "USD")` is not a
        // `Weight(10, "USD")`.
        return other.GetType() == GetType()
               && GetAtomicValues().SequenceEqual(other.GetAtomicValues());
    }

    public override bool Equals(object? obj) => obj is ValueObject other && Equals(other);

    public override int GetHashCode()
    {
        var hash = default(HashCode);

        foreach (var value in GetAtomicValues())
        {
            hash.Add(value);
        }

        return hash.ToHashCode();
    }

    public static bool operator ==(ValueObject? left, ValueObject? right) => Equals(left, right);

    public static bool operator !=(ValueObject? left, ValueObject? right) => !Equals(left, right);
}
