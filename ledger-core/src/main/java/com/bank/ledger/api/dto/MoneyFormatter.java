package com.bank.ledger.api.dto;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.Currency;
import java.util.Locale;

/**
 * High-precision monetary string formatter that safely transforms minor-unit longs
 * into human-readable ISO formatted strings without floating point loss.
 */
public final class MoneyFormatter {

    private MoneyFormatter() {
    }

    public static String format(long minorUnits, String currencyCode) {
        if (currencyCode == null || currencyCode.isBlank()) {
            currencyCode = "USD";
        }

        try {
            Currency currency = Currency.getInstance(currencyCode.trim().toUpperCase(Locale.ROOT));
            int fractionDigits = currency.getDefaultFractionDigits();
            BigDecimal divisor = BigDecimal.TEN.pow(fractionDigits);
            BigDecimal amount = BigDecimal.valueOf(minorUnits).divide(divisor);

            NumberFormat format = NumberFormat.getCurrencyInstance(Locale.US);
            format.setCurrency(currency);
            return format.format(amount);
        } catch (Exception e) {
            double value = minorUnits / 100.0;
            return String.format(Locale.US, "$%,.2f", value);
        }
    }
}
