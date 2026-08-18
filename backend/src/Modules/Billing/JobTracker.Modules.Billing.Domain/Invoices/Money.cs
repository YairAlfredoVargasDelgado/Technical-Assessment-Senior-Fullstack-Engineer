using System.Globalization;

using JobTracker.Common.Domain.Abstractions;
using JobTracker.Common.Domain.Results;

namespace JobTracker.Modules.Billing.Domain.Invoices;

/// <summary>An amount in a currency.</summary>
/// <remarks>
/// <para>
/// A value object rather than a bare <c>decimal</c>. "Primitive obsession" is
/// abstract until the first production incident where a USD figure is added to a
/// CAD one and nothing complains; <see cref="Add"/> makes that a failure instead.
/// </para>
/// <para>
/// <c>decimal</c>, never <c>double</c>: binary floating point cannot represent
/// 0.1 exactly, so money arithmetic accumulates error that eventually shows up as
/// an invoice that is one cent wrong and cannot be explained.
/// </para>
/// </remarks>
public sealed class Money : ValueObject
{
    private Money(decimal amount, string currency)
    {
        Amount = amount;
        Currency = currency;
    }

    /// <summary>Required by EF Core.</summary>
    private Money() => Currency = string.Empty;

    public decimal Amount { get; private init; }

    /// <summary>ISO 4217 code, upper-case.</summary>
    public string Currency { get; private init; }

    public static Result<Money> Create(decimal amount, string currency)
    {
        if (amount < 0)
        {
            return Result.Failure<Money>(InvoiceErrors.AmountMustNotBeNegative);
        }

        return currency is not { Length: 3 }
            ? Result.Failure<Money>(InvoiceErrors.CurrencyMustBeIso4217)
            : Result.Success(new Money(amount, currency.ToUpperInvariant()));
    }

    public Result<Money> Add(Money other)
        => other.Currency != Currency
            ? Result.Failure<Money>(InvoiceErrors.CurrencyMismatch)
            : Result.Success(new Money(Amount + other.Amount, Currency));

    protected override IEnumerable<object?> GetAtomicValues()
    {
        yield return Amount;
        yield return Currency;
    }

    public override string ToString() => $"{Amount.ToString("0.00", CultureInfo.InvariantCulture)} {Currency}";
}
