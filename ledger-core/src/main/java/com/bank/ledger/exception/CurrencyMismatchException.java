package com.bank.ledger.exception;

import java.util.UUID;

/**
 * Thrown when posting legs within a single-currency leg or transfer operate on accounts with mismatched currencies.
 */
public class CurrencyMismatchException extends LedgerException {

    private final UUID accountId;
    private final String expectedCurrency;
    private final String actualCurrency;

    public CurrencyMismatchException(UUID accountId, String expectedCurrency, String actualCurrency) {
        super(String.format(
            "Currency mismatch for account %s: expected %s but found %s.",
            accountId, expectedCurrency, actualCurrency
        ));
        this.accountId = accountId;
        this.expectedCurrency = expectedCurrency;
        this.actualCurrency = actualCurrency;
    }

    public UUID getAccountId() {
        return accountId;
    }

    public String getExpectedCurrency() {
        return expectedCurrency;
    }

    public String getActualCurrency() {
        return actualCurrency;
    }
}
