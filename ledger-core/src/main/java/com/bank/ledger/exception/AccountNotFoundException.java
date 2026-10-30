package com.bank.ledger.exception;

import java.util.UUID;

/**
 * Thrown when an account referenced in a transaction or query cannot be found.
 */
public class AccountNotFoundException extends LedgerException {

    private final UUID accountId;

    public AccountNotFoundException(UUID accountId) {
        super(String.format("Account with ID '%s' was not found in the ledger.", accountId));
        this.accountId = accountId;
    }

    public UUID getAccountId() {
        return accountId;
    }
}
