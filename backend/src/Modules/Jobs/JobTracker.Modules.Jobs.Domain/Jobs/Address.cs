using JobTracker.Common.Domain.Abstractions;
using JobTracker.Common.Domain.Results;

namespace JobTracker.Modules.Jobs.Domain.Jobs;

/// <summary>
/// A postal address with optional coordinates.
/// </summary>
/// <remarks>
/// <para>
/// A value object, not an entity: two addresses with the same street, city,
/// state and postcode <b>are</b> the same address. There is no meaningful
/// question "which of these two identical addresses is it?", which is exactly
/// the test for value-object-ness.
/// </para>
/// <para>
/// Equality is structural and inherited from <see cref="ValueObject"/> — this
/// class supplies only <see cref="GetAtomicValues"/>, so it cannot forget to
/// include a field in an equality override that does not exist here.
/// </para>
/// <para>
/// The constructor is private and <see cref="Create"/> returns a
/// <c>Result</c>: an <c>Address</c> that exists is an <c>Address</c> that is
/// valid. Making invalid states unrepresentable removes the need for every
/// consumer to re-check.
/// </para>
/// </remarks>
public sealed class Address : ValueObject
{
    private Address(
        string street,
        string city,
        string state,
        string zipCode,
        double? latitude,
        double? longitude)
    {
        Street = street;
        City = city;
        State = state;
        ZipCode = zipCode;
        Latitude = latitude;
        Longitude = longitude;
    }

    /// <summary>Required by EF Core when materialising the owned type.</summary>
    private Address()
    {
        Street = string.Empty;
        City = string.Empty;
        State = string.Empty;
        ZipCode = string.Empty;
    }

    public string Street { get; private init; }

    public string City { get; private init; }

    public string State { get; private init; }

    public string ZipCode { get; private init; }

    /// <summary>
    /// Latitude, when the address has been geocoded.
    /// </summary>
    /// <remarks>
    /// Nullable because geocoding happens asynchronously and may fail. Defaulting
    /// to <c>0</c> would place un-geocoded jobs in the Gulf of Guinea and make
    /// "near me" searches quietly wrong rather than obviously incomplete.
    /// </remarks>
    public double? Latitude { get; private init; }

    public double? Longitude { get; private init; }

    public static Result<Address> Create(
        string street,
        string city,
        string state,
        string zipCode,
        double? latitude = null,
        double? longitude = null)
    {
        if (string.IsNullOrWhiteSpace(street))
        {
            return Result.Failure<Address>(AddressErrors.StreetRequired);
        }

        if (string.IsNullOrWhiteSpace(city))
        {
            return Result.Failure<Address>(AddressErrors.CityRequired);
        }

        if (string.IsNullOrWhiteSpace(state))
        {
            return Result.Failure<Address>(AddressErrors.StateRequired);
        }

        if (string.IsNullOrWhiteSpace(zipCode))
        {
            return Result.Failure<Address>(AddressErrors.ZipCodeRequired);
        }

        // Coordinates are all-or-nothing: a latitude without a longitude is not
        // a partially-known location, it is a bug in whatever produced it.
        if (latitude.HasValue != longitude.HasValue)
        {
            return Result.Failure<Address>(AddressErrors.IncompleteCoordinates);
        }

        if (latitude is < -90 or > 90)
        {
            return Result.Failure<Address>(AddressErrors.LatitudeOutOfRange);
        }

        if (longitude is < -180 or > 180)
        {
            return Result.Failure<Address>(AddressErrors.LongitudeOutOfRange);
        }

        return Result.Success(new Address(
            street.Trim(),
            city.Trim(),
            state.Trim(),
            zipCode.Trim(),
            latitude,
            longitude));
    }

    /// <summary>
    /// The fields that define equality, in a fixed order.
    /// </summary>
    /// <remarks>
    /// Coordinates participate deliberately: two records of the same postal
    /// address where one has been geocoded and the other has not are not
    /// interchangeable, and treating them as equal would let a geocoding result
    /// be silently discarded by a no-op update check.
    /// </remarks>
    protected override IEnumerable<object?> GetAtomicValues()
    {
        yield return Street;
        yield return City;
        yield return State;
        yield return ZipCode;
        yield return Latitude;
        yield return Longitude;
    }

    public override string ToString() => $"{Street}, {City}, {State} {ZipCode}";
}
