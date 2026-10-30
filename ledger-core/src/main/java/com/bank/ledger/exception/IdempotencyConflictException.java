package com.bank.ledger.exception;

/**
 * Thrown when an idempotency key was previously processed with different transaction parameters.
 */
public class IdempotencyConflictException extends LedgerException {

    private final String idempotencyKey;

    public IdempotencyConflictException(String idempotencyKey, String message) {
        super(String.format("Idempotency conflict for key '%s': %s", idempotencyKey, message));
        this.idempotencyKey = idempotencyKey;
    }

    public String getIdempotencyKey() {
        return idempotencyKey;
    }
}
