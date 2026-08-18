using JobTracker.Common.Domain.Results;

namespace JobTracker.Modules.Jobs.Domain.Jobs;

/// <summary>
/// Every way constructing an <see cref="Address"/> can fail.
/// </summary>
/// <remarks>
/// Collected in one place so error codes are declared once and can be enumerated
/// — for API documentation, for client-side message catalogues, for a test that
/// asserts no two codes collide. Inline <c>Error.Validation("...")</c> calls
/// scattered through the domain make that impossible and let the same failure
/// acquire two different codes in two different methods.
/// </remarks>
public static class AddressErrors
{
    public static readonly Error StreetRequired =
        Error.Validation("Address.StreetRequired", "Street is required.");

    public static readonly Error CityRequired =
        Error.Validation("Address.CityRequired", "City is required.");

    public static readonly Error StateRequired =
        Error.Validation("Address.StateRequired", "State is required.");

    public static readonly Error ZipCodeRequired =
        Error.Validation("Address.ZipCodeRequired", "Zip code is required.");

    public static readonly Error IncompleteCoordinates =
        Error.Validation(
            "Address.IncompleteCoordinates",
            "Latitude and longitude must be supplied together.");

    public static readonly Error LatitudeOutOfRange =
        Error.Validation("Address.LatitudeOutOfRange", "Latitude must be between -90 and 90.");

    public static readonly Error LongitudeOutOfRange =
        Error.Validation("Address.LongitudeOutOfRange", "Longitude must be between -180 and 180.");
}
