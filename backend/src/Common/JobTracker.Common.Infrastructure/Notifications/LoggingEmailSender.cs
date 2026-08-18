using JobTracker.Common.Application.Abstractions.Notifications;

using Microsoft.Extensions.Logging;

namespace JobTracker.Common.Infrastructure.Notifications;

/// <summary>
/// Writes each outgoing email to the log instead of sending it.
/// </summary>
/// <remarks>
/// <para>
/// The development implementation of <see cref="IEmailSender"/>. A
/// <c>SendGridEmailSender</c> implementing the same interface is one class and one
/// registration line away; it is not included because it requires a live API key,
/// and an implementation that silently swallows failures against a placeholder key
/// would be worse than an honest boundary.
/// </para>
/// <para>
/// That the swap is this cheap is the point of the abstraction — and the clearest
/// Liskov example in the codebase: nothing that sends mail can tell which
/// implementation it is talking to, because the contract promises only "accepted
/// for delivery", which both honour.
/// </para>
/// </remarks>
public sealed class LoggingEmailSender(ILogger<LoggingEmailSender> logger) : IEmailSender
{
    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        logger.LogInformation(
            "Email dispatched to {Recipient} with subject {Subject}: {Body}",
            message.To,
            message.Subject,
            message.Body);

        return Task.CompletedTask;
    }
}
