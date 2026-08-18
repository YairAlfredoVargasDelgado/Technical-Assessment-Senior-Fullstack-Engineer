using System.Data;
using System.Text.Json;

using Dapper;

using JobTracker.Common.Domain.Abstractions;

using MediatR;

using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

using Npgsql;

namespace JobTracker.Common.Infrastructure.Outbox;

/// <summary>
/// Drains one module's outbox: reads unprocessed messages, publishes them, marks
/// them done.
/// </summary>
/// <remarks>
/// <para>
/// The GoF <b>Template Method</b> pattern. The algorithm — claim a batch,
/// deserialise, publish, record the consumer, mark processed — is identical for
/// every module and lives here once. Each module supplies only what differs: its
/// schema name, through <see cref="Schema"/>. Copying this class per module would
/// mean every fix to the retry or claiming logic has to be applied N times, and
/// the module that gets missed fails in production at 3am.
/// </para>
/// <para>
/// <b>Raw SQL, not EF Core.</b> This is a polling loop over a queue table, and it
/// needs <c>FOR UPDATE SKIP LOCKED</c> — the mechanism that lets several workers
/// drain the same outbox concurrently without any of them blocking or two of them
/// claiming the same row. EF Core has no expression for that, and the change
/// tracker is pure overhead for rows that are read once and updated once.
/// </para>
/// <para>
/// <b>Failure handling.</b> A message whose handler throws is left with its error
/// recorded and <c>processed_on_utc</c> set, so the loop does not spin forever on
/// a poison message. The row remains in the table with its error for diagnosis
/// and manual replay. Handlers that already succeeded are recorded in
/// <c>outbox_message_consumers</c>, so a replay does not re-run them.
/// </para>
/// </remarks>
public abstract class ProcessOutboxMessagesJobBase(
    NpgsqlDataSource dataSource,
    IPublisher publisher,
    IOptions<OutboxOptions> options,
    ILogger logger)
{
    /// <summary>The module's schema — the only thing that varies between modules.</summary>
    protected abstract string Schema { get; }

    public async Task ExecuteAsync(CancellationToken cancellationToken = default)
    {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        var messages = await ClaimPendingMessagesAsync(connection, transaction, cancellationToken);

        foreach (var message in messages)
        {
            string? error = null;

            try
            {
                var domainEvent = Deserialize(message);

                var handlerName = domainEvent.GetType().Name;

                // Dispatch-level idempotency: if this handler already ran for
                // this message on an earlier delivery, skip it.
                if (await HasBeenConsumedAsync(connection, transaction, message.Id, handlerName, cancellationToken))
                {
                    logger.LogDebug(
                        "Outbox message {MessageId} was already consumed by {Handler}; skipping.",
                        message.Id,
                        handlerName);
                }
                else
                {
                    await publisher.Publish(domainEvent, cancellationToken);
                    await RecordConsumerAsync(connection, transaction, message.Id, handlerName, cancellationToken);
                }
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                // Caught per message rather than per batch: one poison message
                // must not stop the eighteen healthy ones behind it.
                logger.LogError(exception, "Outbox message {MessageId} failed to process.", message.Id);
                error = exception.ToString();
            }

            await MarkProcessedAsync(connection, transaction, message.Id, error, cancellationToken);
        }

        await transaction.CommitAsync(cancellationToken);
    }

    private async Task<IReadOnlyList<OutboxMessageRow>> ClaimPendingMessagesAsync(
        NpgsqlConnection connection,
        IDbTransaction transaction,
        CancellationToken cancellationToken)
    {
        // FOR UPDATE SKIP LOCKED is what makes this safe to run on several
        // instances at once: each worker claims rows no other worker holds,
        // rather than queueing behind them.
        var sql = $"""
            SELECT id AS {nameof(OutboxMessageRow.Id)},
                   type AS {nameof(OutboxMessageRow.Type)},
                   content AS {nameof(OutboxMessageRow.Content)}
            FROM {Schema}.outbox_messages
            WHERE processed_on_utc IS NULL
            ORDER BY occurred_on_utc
            LIMIT @BatchSize
            FOR UPDATE SKIP LOCKED
            """;

        var rows = await connection.QueryAsync<OutboxMessageRow>(
            new CommandDefinition(
                sql,
                new { options.Value.BatchSize },
                transaction,
                cancellationToken: cancellationToken));

        return [.. rows];
    }

    private async Task<bool> HasBeenConsumedAsync(
        NpgsqlConnection connection,
        IDbTransaction transaction,
        Guid messageId,
        string handlerName,
        CancellationToken cancellationToken)
        => await connection.ExecuteScalarAsync<bool>(
            new CommandDefinition(
                $"""
                 SELECT EXISTS (
                     SELECT 1 FROM {Schema}.outbox_message_consumers
                     WHERE outbox_message_id = @MessageId AND name = @HandlerName
                 )
                 """,
                new { MessageId = messageId, HandlerName = handlerName },
                transaction,
                cancellationToken: cancellationToken));

    private async Task RecordConsumerAsync(
        NpgsqlConnection connection,
        IDbTransaction transaction,
        Guid messageId,
        string handlerName,
        CancellationToken cancellationToken)
        => await connection.ExecuteAsync(
            new CommandDefinition(
                $"""
                 INSERT INTO {Schema}.outbox_message_consumers (outbox_message_id, name)
                 VALUES (@MessageId, @HandlerName)
                 ON CONFLICT DO NOTHING
                 """,
                new { MessageId = messageId, HandlerName = handlerName },
                transaction,
                cancellationToken: cancellationToken));

    private async Task MarkProcessedAsync(
        NpgsqlConnection connection,
        IDbTransaction transaction,
        Guid messageId,
        string? error,
        CancellationToken cancellationToken)
        => await connection.ExecuteAsync(
            new CommandDefinition(
                $"""
                 UPDATE {Schema}.outbox_messages
                 SET processed_on_utc = @ProcessedOnUtc, error = @Error
                 WHERE id = @MessageId
                 """,
                new { MessageId = messageId, ProcessedOnUtc = DateTime.UtcNow, Error = error },
                transaction,
                cancellationToken: cancellationToken));

    private static IDomainEvent Deserialize(OutboxMessageRow row)
    {
        // The type name came from our own interceptor, never from user input, so
        // resolving it does not open a deserialisation gadget.
        var type = Type.GetType(row.Type)
                   ?? throw new InvalidOperationException(
                       $"Outbox message {row.Id} refers to type '{row.Type}', which this build cannot resolve. "
                       + "The type was renamed or removed while messages were still queued under the old name.");

        return JsonSerializer.Deserialize(row.Content, type, InsertOutboxMessagesInterceptor.SerializerOptions)
                   as IDomainEvent
               ?? throw new InvalidOperationException($"Outbox message {row.Id} did not deserialise to a domain event.");
    }

    /// <summary>Flat row shape for the Dapper read. Not the EF entity.</summary>
    private sealed record OutboxMessageRow
    {
        public Guid Id { get; init; }

        public string Type { get; init; } = string.Empty;

        public string Content { get; init; } = string.Empty;
    }
}
