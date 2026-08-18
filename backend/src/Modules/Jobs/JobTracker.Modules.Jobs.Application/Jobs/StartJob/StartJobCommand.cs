using JobTracker.Common.Application.Abstractions.Messaging;

using MediatR;

namespace JobTracker.Modules.Jobs.Application.Jobs.StartJob;

/// <summary>Marks a scheduled job as under way.</summary>
/// <remarks>
/// Returns <c>Unit</c> rather than nothing: the command produces no value, and
/// <c>Result&lt;Unit&gt;</c> is how that is spelled without a second parallel
/// hierarchy of void-command abstractions.
/// </remarks>
public sealed record StartJobCommand(Guid JobId) : ICommand<Unit>;
