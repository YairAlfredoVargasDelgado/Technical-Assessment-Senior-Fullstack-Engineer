using JobTracker.Common.Application.Abstractions.Messaging;

using MediatR;

namespace JobTracker.Modules.Jobs.Application.Jobs.CompleteJob;

/// <summary>
/// Completes a job that is in progress.
/// </summary>
/// <remarks>
/// Completion is the event the rest of the system cares about: it is what
/// eventually produces an invoice in Billing and an email to the customer. Those
/// consequences are not this command's concern — it changes the job, and the
/// domain event the aggregate raises carries the news outward.
/// </remarks>
public sealed record CompleteJobCommand(Guid JobId, string SignatureUrl) : ICommand<Unit>;
