using JobTracker.Common.Domain.Results;

namespace JobTracker.Modules.Billing.Domain.Invoices;

public static class InvoiceErrors
{
    public static readonly Error AmountMustNotBeNegative =
        Error.Validation("Money.AmountMustNotBeNegative", "An amount cannot be negative.");

    public static readonly Error CurrencyMustBeIso4217 =
        Error.Validation("Money.CurrencyMustBeIso4217", "A currency must be a three-letter ISO 4217 code.");

    public static readonly Error CurrencyMismatch =
        Error.Conflict("Money.CurrencyMismatch", "Amounts in different currencies cannot be combined.");

    public static readonly Error IdempotencyKeyRequired =
        Error.Validation("Invoice.IdempotencyKeyRequired", "An idempotency key is required.");
}
