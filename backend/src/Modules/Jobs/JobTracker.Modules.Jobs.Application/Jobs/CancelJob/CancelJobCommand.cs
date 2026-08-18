using JobTracker.Common.Application.Abstractions.Messaging;

using MediatR;

namespace JobTracker.Modules.Jobs.Application.Jobs.CancelJob;

/// <summary>Abandons a job before completion, recording why.</summary>
public sealed record CancelJobCommand(Guid JobId, string Reason) : ICommand<Unit>;
