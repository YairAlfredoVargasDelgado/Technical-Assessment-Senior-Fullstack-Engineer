namespace JobTracker.Common.Application.Abstractions.Notifications;

/// <summary>
/// Delivers an email.
/// </summary>
/// <remarks>
/// <para>
/// Deliberately narrow — one method, one parameter. A provider-shaped interface
/// (templates, dynamic data, categories, sandbox flags) would push SendGrid's
/// vocabulary into every caller and make the abstraction worthless: swapping
/// provider would then mean rewriting the call sites it was supposed to protect.
/// This is Interface Segregation stated as "depend on what you use".
/// </para>
/// <para>
/// The implementation shipped here writes structured log entries. A
/// <c>SendGridEmailSender</c> is a single class implementing this same interface
/// and one line of registration; it is not wired in because it requires a live
/// API key, and a take-home that silently swallows send failures against a fake
/// key would be worse than one that is explicit about the boundary. See the
/// README.
/// </para>
/// </remarks>
public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default);
}
