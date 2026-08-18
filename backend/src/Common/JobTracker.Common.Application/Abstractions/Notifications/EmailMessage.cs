namespace JobTracker.Common.Application.Abstractions.Notifications;

/// <summary>An email to be delivered.</summary>
/// <param name="To">Recipient address.</param>
/// <param name="Subject">Subject line.</param>
/// <param name="Body">Plain-text body.</param>
public sealed record EmailMessage(string To, string Subject, string Body);
