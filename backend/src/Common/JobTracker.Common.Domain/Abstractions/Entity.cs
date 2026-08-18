namespace JobTracker.Common.Domain.Abstractions;

/// <summary>
/// An object with a thread of identity: two entities are the same entity when
/// their identifiers match, regardless of how their other data differs.
/// </summary>
/// <remarks>
/// Contrast with <see cref="ValueObject"/>, which is the exact opposite: no
/// identity, equality entirely structural. Picking the wrong one of the two is
/// one of the more expensive modelling mistakes in DDD, so they are deliberately
/// separate base types rather than one configurable base.
/// </remarks>
public abstract class Entity : IEquatable<Entity>
{
    protected Entity(Guid id) => Id = id;

    /// <summary>Required by EF Core's materialiser, which needs a parameterless path.</summary>
    protected Entity()
    {
    }

    public Guid Id { get; protected init; }

    public bool Equals(Entity? other)
    {
        if (other is null)
        {
            return false;
        }

        // A `Draft` and a `Photo` sharing a Guid are not the same object.
        if (other.GetType() != GetType())
        {
            return false;
        }

        // Transient entities (not yet persisted, Id still empty) are only ever
        // equal to themselves; comparing them by an unset identifier would make
        // every new entity equal to every other new entity.
        return Id != Guid.Empty && other.Id == Id;
    }

    public override bool Equals(object? obj) => obj is Entity entity && Equals(entity);

    public override int GetHashCode() => HashCode.Combine(GetType(), Id);

    public static bool operator ==(Entity? left, Entity? right) => Equals(left, right);

    public static bool operator !=(Entity? left, Entity? right) => !Equals(left, right);
}
