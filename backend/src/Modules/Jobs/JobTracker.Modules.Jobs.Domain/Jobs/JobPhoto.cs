using JobTracker.Common.Domain.Abstractions;
using JobTracker.Common.Domain.Results;

namespace JobTracker.Modules.Jobs.Domain.Jobs;

/// <summary>
/// A photograph captured while a job was being carried out.
/// </summary>
/// <remarks>
/// <para>
/// An <b>entity inside the Job aggregate</b>, not an aggregate root of its own.
/// It has identity (two photos of the same wall are different photos), but it
/// has no independent life: it is meaningless without the job it documents, and
/// it is never loaded, saved or deleted on its own.
/// </para>
/// <para>
/// Both constructors are private and <see cref="Create"/> is <c>internal</c>, so
/// the only code in the world that can produce a <c>JobPhoto</c> is the
/// <see cref="Job"/> aggregate in this assembly. That is what "only accessible
/// through the aggregate root" means in enforceable terms rather than as a
/// convention: an application handler that tries to attach a photo directly does
/// not fail review, it fails to compile.
/// </para>
/// </remarks>
public sealed class JobPhoto : Entity
{
    private JobPhoto(Guid id, Guid jobId, string url, DateTime capturedAtUtc, string? caption)
        : base(id)
    {
        JobId = jobId;
        Url = url;
        CapturedAtUtc = capturedAtUtc;
        Caption = caption;
    }

    /// <summary>Required by EF Core's materialiser.</summary>
    private JobPhoto()
    {
        Url = string.Empty;
    }

    public Guid JobId { get; private init; }

    public string Url { get; private init; }

    public DateTime CapturedAtUtc { get; private init; }

    public string? Caption { get; private init; }

    /// <summary>
    /// Creates a photo. Callable only from within this assembly — in practice,
    /// only from <see cref="Job.AddPhoto"/>.
    /// </summary>
    internal static Result<JobPhoto> Create(Guid jobId, string url, DateTime capturedAtUtc, string? caption)
    {
        if (string.IsNullOrWhiteSpace(url))
        {
            return Result.Failure<JobPhoto>(JobErrors.PhotoUrlRequired);
        }

        if (!Uri.TryCreate(url, UriKind.Absolute, out var parsed)
            || (parsed.Scheme != Uri.UriSchemeHttps && parsed.Scheme != Uri.UriSchemeHttp))
        {
            return Result.Failure<JobPhoto>(JobErrors.PhotoUrlInvalid);
        }

        return Result.Success(new JobPhoto(Guid.NewGuid(), jobId, url, capturedAtUtc, caption?.Trim()));
    }
}
