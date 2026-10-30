package com.bank.ledger.exception;

/**
 * Base exception for all core banking and ledger domain errors.
 */
public class LedgerException extends RuntimeException {
    public LedgerException(String message) {
        super(message);
    }

    public LedgerException(String message, Throwable cause) {
        super(message, cause);
    }
}
