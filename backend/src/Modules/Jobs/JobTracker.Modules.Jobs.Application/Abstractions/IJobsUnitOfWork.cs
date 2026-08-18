using JobTracker.Common.Application.Abstractions.Data;

namespace JobTracker.Modules.Jobs.Application.Abstractions;

/// <summary>
/// The Jobs module's transaction boundary.
/// </summary>
/// <remarks>
/// <para>
/// <b>Why a module-specific interface exists at all.</b> Each module owns a
/// separate <c>DbContext</c> over a separate schema, and both implement
/// <see cref="IUnitOfWork"/>. A handler asking the container for a bare
/// <c>IUnitOfWork</c> would receive whichever module registered last — so a Jobs
/// handler could silently commit through Billing's context, find no tracked
/// changes, and save nothing at all. The failure would be a command that reports
/// success and writes nothing.
/// </para>
/// <para>
/// The alternatives were keyed services, which puts a magic string in every
/// handler's constructor, and injecting the concrete <c>DbContext</c>, which
/// hands the application layer a dependency on EF Core. A marker interface per
/// module costs one file and makes the mistake a compile error.
/// </para>
/// </remarks>
public interface IJobsUnitOfWork : IUnitOfWork;
