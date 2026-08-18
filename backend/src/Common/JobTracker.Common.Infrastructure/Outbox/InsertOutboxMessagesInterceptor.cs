using System.Text.Json;

using JobTracker.Common.Domain.Abstractions;

using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace JobTracker.Common.Infrastructure.Outbox;

/// <summary>
/// Converts the domain events raised during a transaction into outbox rows,
/// inside that same transaction.
/// </summary>
/// <remarks>
/// <para>
/// <b>Why an interceptor and not the handler.</b> Every command handler that
/// changes an aggregate would otherwise have to remember to collect its events
/// and write them. That is a rule enforced by discipline, and the handler that
/// forgets produces a silent data-loss bug — the job changes, nobody downstream
/// is told, and nothing fails. Here it is impossible to forget: the events are
/// harvested by the persistence pipeline itself, so any code path that saves gets
/// the behaviour.
/// </para>
/// <para>
/// <b>Why <c>SavingChangesAsync</c> specifically.</b> This runs after EF has built
/// its change set but before the SQL is sent, so the <c>INSERT</c>s it adds join
/// the same transaction as the aggregate's own <c>UPDATE</c>. Doing this after
/// the save would reopen exactly the dual-write hole the outbox exists to close.
/// </para>
/// <para>
/// This is the GoF <b>Observer</b> pattern spanning a process boundary: the
/// aggregate announces facts without knowing who listens, and the transport is
/// supplied entirely by infrastructure.
/// </para>
/// </remarks>
public sealed class InsertOutboxMessagesInterceptor : SaveChangesInterceptor
{
    /// <summary>
    /// Serialisation settings for outbox content.
    /// </summary>
    /// <remarks>
    /// <c>TypeNameHandling</c>-style polymorphism is deliberately not used. The
    /// concrete type is recorded in <see cref="OutboxMessage.Type"/> and resolved
    /// explicitly on the way out, so a stored payload can never instruct the
    /// deserialiser to construct an arbitrary type — the classic deserialisation
    /// gadget vulnerability.
    /// </remarks>
    public static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false,
    };

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is { } context)
        {
            InsertOutboxMessages(context);
        }

        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    private static void InsertOutboxMessages(DbContext context)
    {
        var aggregates = context.ChangeTracker
            .Entries<AggregateRoot>()
            .Select(entry => entry.Entity)
            .Where(aggregate => aggregate.DomainEvents.Count > 0)
            .ToArray();

        if (aggregates.Length == 0)
        {
            return;
        }

        var outboxMessages = new List<OutboxMessage>();

        foreach (var aggregate in aggregates)
        {
            foreach (var domainEvent in aggregate.DomainEvents)
            {
                outboxMessages.Add(new OutboxMessage
                {
                    Id = domainEvent.Id,

                    // Assembly-qualified so the consumer can resolve the type
                    // without a registry that would have to be kept in step.
                    Type = domainEvent.GetType().AssemblyQualifiedName!,

                    // Serialised against its concrete type, not IDomainEvent —
                    // serialising through the interface would write only the two
                    // interface properties and silently drop the payload.
                    Content = JsonSerializer.Serialize(domainEvent, domainEvent.GetType(), SerializerOptions),

                    OccurredOnUtc = domainEvent.OccurredOnUtc,
                });
            }

            // Cleared once captured: leaving them attached would republish every
            // past event of this aggregate on its next save.
            aggregate.ClearDomainEvents();
        }

        context.Set<OutboxMessage>().AddRange(outboxMessages);
    }
}
