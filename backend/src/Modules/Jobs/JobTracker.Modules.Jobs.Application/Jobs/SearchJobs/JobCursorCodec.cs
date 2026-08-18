using System.Buffers.Text;
using System.Globalization;
using System.Text;

using JobTracker.Modules.Jobs.Domain.Jobs;

namespace JobTracker.Modules.Jobs.Application.Jobs.SearchJobs;

/// <summary>
/// Encodes a <see cref="JobCursor"/> as an opaque string and back.
/// </summary>
/// <remarks>
/// <para>
/// Base64url, not JSON and not a readable "date|id" pair. The encoding is not
/// security — anyone can decode it — it is a contract signal: a cursor is a token
/// the server issued and the client hands back untouched. A readable format
/// invites clients to construct their own, and the day the ordering key changes,
/// those clients break in ways the server cannot detect.
/// </para>
/// <para>
/// Decoding returns <c>null</c> rather than throwing. A malformed cursor is
/// ordinary bad input from an untrusted client, and the caller turns it into a
/// validation failure.
/// </para>
/// </remarks>
internal static class JobCursorCodec
{
    private const char Separator = '|';

    public static string Encode(JobCursor cursor)
    {
        var payload = string.Create(
            CultureInfo.InvariantCulture,
            $"{cursor.SortKeyUtc.Ticks}{Separator}{cursor.Id:N}");

        return Base64Url.EncodeToString(Encoding.UTF8.GetBytes(payload));
    }

    public static JobCursor? Decode(string? encoded)
    {
        if (string.IsNullOrWhiteSpace(encoded))
        {
            return null;
        }

        byte[] decoded;
        try
        {
            decoded = Base64Url.DecodeFromChars(encoded);
        }
        catch (FormatException)
        {
            return null;
        }

        var parts = Encoding.UTF8.GetString(decoded).Split(Separator);
        if (parts.Length != 2)
        {
            return null;
        }

        if (!long.TryParse(parts[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var ticks)
            || ticks < DateTime.MinValue.Ticks
            || ticks > DateTime.MaxValue.Ticks)
        {
            return null;
        }

        return Guid.TryParseExact(parts[1], "N", out var id)
            ? new JobCursor(new DateTime(ticks, DateTimeKind.Utc), id)
            : null;
    }
}
