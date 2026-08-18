using FluentAssertions;

using JobTracker.Modules.Jobs.Domain.Jobs;

namespace JobTracker.Jobs.Domain.UnitTests.Jobs;

/// <summary>
/// Tests for <see cref="Address"/>, with structural equality as the headline
/// property.
/// </summary>
public sealed class AddressTests
{
    private static Address Sample(
        string street = "12 Elm Street",
        string city = "Newark",
        string state = "NJ",
        string zip = "07102",
        double? lat = 40.7357,
        double? lng = -74.1724)
        => Address.Create(street, city, state, zip, lat, lng).Value;

    /* ---------------------------------------------------------------------- */
    /* Structural equality                                                    */
    /* ---------------------------------------------------------------------- */

    [Fact]
    public void TwoSeparatelyConstructedAddressesWithTheSameValues_AreEqual()
    {
        var left = Sample();
        var right = Sample();

        // Distinct objects on the heap...
        ReferenceEquals(left, right).Should().BeFalse();

        // ...but the same value.
        left.Should().Be(right);
        (left == right).Should().BeTrue();
        (left != right).Should().BeFalse();
        left.GetHashCode().Should().Be(right.GetHashCode());
    }

    [Fact]
    public void EqualAddresses_BehaveAsOneKeyInAHashSet()
    {
        // The practical consequence of a correct GetHashCode: without it, a set
        // would happily hold two copies of the same address.
        var set = new HashSet<Address> { Sample(), Sample() };

        set.Should().ContainSingle();
    }

    [Theory]
    [InlineData("99 Oak Avenue", "Newark", "NJ", "07102")]
    [InlineData("12 Elm Street", "Trenton", "NJ", "07102")]
    [InlineData("12 Elm Street", "Newark", "NY", "07102")]
    [InlineData("12 Elm Street", "Newark", "NJ", "07103")]
    public void AddressesDifferingInAnyPostalField_AreNotEqual(
        string street,
        string city,
        string state,
        string zip)
    {
        Sample().Should().NotBe(Sample(street, city, state, zip));
    }

    [Fact]
    public void AddressesDifferingOnlyInCoordinates_AreNotEqual()
    {
        // Geocoded and un-geocoded records of the same postal address are not
        // interchangeable — treating them as equal would let a geocoding result
        // be discarded by a no-op update check.
        Sample().Should().NotBe(Sample(lat: null, lng: null));
    }

    [Fact]
    public void AnAddress_IsNotEqualToNullOrToAnUnrelatedType()
    {
        var address = Sample();

        // Typed locals rather than bare `null` literals: passing a literal null
        // to `Equals` moves the compiler's flow analysis to "maybe null" for the
        // receiver, which then reports a spurious CS8602 on the following line.
        object? nothing = null;
        Address? missingAddress = null;

        address.Equals(nothing).Should().BeFalse();
        address.Equals("12 Elm Street, Newark, NJ 07102").Should().BeFalse();

        (address == missingAddress).Should().BeFalse();
        (missingAddress == address).Should().BeFalse();
        (address != missingAddress).Should().BeTrue();
    }

    [Fact]
    public void TwoNullAddresses_AreEqual()
    {
        // The operators must not dereference their operands.
        Address? left = null;
        Address? right = null;

        (left == right).Should().BeTrue();
        (left != right).Should().BeFalse();
    }

    /* ---------------------------------------------------------------------- */
    /* Construction guards                                                    */
    /* ---------------------------------------------------------------------- */

    [Theory]
    [InlineData("", "Newark", "NJ", "07102", "Address.StreetRequired")]
    [InlineData("  ", "Newark", "NJ", "07102", "Address.StreetRequired")]
    [InlineData("12 Elm Street", "", "NJ", "07102", "Address.CityRequired")]
    [InlineData("12 Elm Street", "Newark", "", "07102", "Address.StateRequired")]
    [InlineData("12 Elm Street", "Newark", "NJ", "", "Address.ZipCodeRequired")]
    public void Create_WithAMissingPostalField_Fails(
        string street,
        string city,
        string state,
        string zip,
        string expectedCode)
    {
        var result = Address.Create(street, city, state, zip);

        result.IsFailure.Should().BeTrue();
        result.Error.Code.Should().Be(expectedCode);
    }

    [Fact]
    public void Create_WithoutCoordinates_Succeeds()
    {
        var result = Address.Create("12 Elm Street", "Newark", "NJ", "07102");

        result.IsSuccess.Should().BeTrue();
        result.Value.Latitude.Should().BeNull();
        result.Value.Longitude.Should().BeNull();
    }

    [Theory]
    [InlineData(40.7357, null)]
    [InlineData(null, -74.1724)]
    public void Create_WithHalfACoordinatePair_Fails(double? lat, double? lng)
    {
        Address.Create("12 Elm Street", "Newark", "NJ", "07102", lat, lng)
            .Error.Should().Be(AddressErrors.IncompleteCoordinates);
    }

    [Theory]
    [InlineData(90.1)]
    [InlineData(-90.1)]
    public void Create_WithLatitudeOutOfRange_Fails(double lat)
    {
        Address.Create("12 Elm Street", "Newark", "NJ", "07102", lat, 0)
            .Error.Should().Be(AddressErrors.LatitudeOutOfRange);
    }

    [Theory]
    [InlineData(180.1)]
    [InlineData(-180.1)]
    public void Create_WithLongitudeOutOfRange_Fails(double lng)
    {
        Address.Create("12 Elm Street", "Newark", "NJ", "07102", 0, lng)
            .Error.Should().Be(AddressErrors.LongitudeOutOfRange);
    }

    [Theory]
    [InlineData(90)]
    [InlineData(-90)]
    public void Create_AtTheLatitudeBoundary_Succeeds(double lat)
    {
        Address.Create("12 Elm Street", "Newark", "NJ", "07102", lat, 0).IsSuccess.Should().BeTrue();
    }

    [Fact]
    public void Create_TrimsSurroundingWhitespace()
    {
        var address = Address.Create("  12 Elm Street  ", " Newark ", " NJ ", " 07102 ").Value;

        address.Street.Should().Be("12 Elm Street");
        address.City.Should().Be("Newark");
        address.State.Should().Be("NJ");
        address.ZipCode.Should().Be("07102");
    }

    [Fact]
    public void Create_TreatsPaddedAndUnpaddedInputAsTheSameValue()
    {
        // Trimming would be pointless if it did not make the two compare equal.
        Address.Create("  12 Elm Street  ", "Newark", "NJ", "07102").Value
            .Should().Be(Address.Create("12 Elm Street", "Newark", "NJ", "07102").Value);
    }

    [Fact]
    public void ToString_RendersAOneLinePostalAddress()
    {
        Sample().ToString().Should().Be("12 Elm Street, Newark, NJ 07102");
    }
}
