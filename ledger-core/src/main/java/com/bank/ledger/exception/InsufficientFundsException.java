package com.bank.ledger.exception;

import java.util.UUID;

/**
 * Thrown when an account operation would cause available balance to drop below zero
 * on an account that does not allow negative balances.
 */
public class InsufficientFundsException extends LedgerException {

    private final UUID accountId;
    private final long availableBalance;
    private final long requiredAmount;

    public InsufficientFundsException(UUID accountId, long availableBalance, long requiredAmount) {
        super(String.format(
            "Account %s has insufficient funds: available balance is %d minor units, but %d required.",
            accountId, availableBalance, requiredAmount
        ));
        this.accountId = accountId;
        this.availableBalance = availableBalance;
        this.requiredAmount = requiredAmount;
    }

    public UUID getAccountId() {
        return accountId;
    }

    public long getAvailableBalance() {
        return availableBalance;
    }

    public long getRequiredAmount() {
        return requiredAmount;
    }

    public long getAttemptedAmount() {
        return requiredAmount;
    }
}
