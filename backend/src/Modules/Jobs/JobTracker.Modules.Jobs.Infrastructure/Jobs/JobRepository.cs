using JobTracker.Modules.Jobs.Domain.Jobs;
using JobTracker.Modules.Jobs.Infrastructure.Database;

namespace JobTracker.Modules.Jobs.Infrastructure.Jobs;

/// <summary>
/// EF Core implementation of <see cref="IJobRepository"/>.
/// </summary>
/// <remarks>
/// <para>
/// <b>Why this type is split across files.</b> The write side and the read side
/// of this repository have almost nothing in common. Writes load tracked
/// aggregates with their children so invariants can be enforced; reads project
/// untracked rows through a keyset-paginated, full-text-filtered query. They
/// change for different reasons, are tuned against different index sets, and are
/// reviewed by people asking different questions.
/// </para>
/// <list type="bullet">
///   <item><c>JobRepository.Writes.cs</c> — loading and adding aggregates.</item>
///   <item><c>JobRepository.Reads.cs</c> — the projected search query.</item>
/// </list>
/// <para>
/// <b>An honest note on the technique.</b> A class that needs splitting is often
/// a class doing too much, and <c>partial</c> can be used to hide exactly that.
/// It is not what is happening here: the split runs along the CQRS seam the rest
/// of the system already observes, and the two halves share only the injected
/// context. If a third concern appeared, the right response would be a second
/// class, not a third file.
/// </para>
/// </remarks>
internal sealed partial class JobRepository(JobsDbContext context) : IJobRepository;
