package com.bank.ledger.domain;

import java.util.Objects;
import java.util.UUID;

/**
 * An immutable posting leg in a double-entry transaction.
 *
 * @param id             unique identifier of the posting leg
 * @param transactionId  the transaction this posting belongs to
 * @param accountId      the account being debited or credited
 * @param amount         monetary amount in minor units (cents); strictly positive
 * @param direction      DEBIT or CREDIT
 * @param sequenceIndex  zero-based order within the transaction
 */
public record Posting(
    UUID id,
    UUID transactionId,
    UUID accountId,
    long amount,
    Direction direction,
    int sequenceIndex
) {
    public Posting {
        Objects.requireNonNull(id, "Posting id must not be null");
        Objects.requireNonNull(transactionId, "Posting transactionId must not be null");
        Objects.requireNonNull(accountId, "Posting accountId must not be null");
        Objects.requireNonNull(direction, "Posting direction must not be null");
        if (amount <= 0L) {
            throw new IllegalArgumentException("Posting amount must be strictly positive (> 0), got: " + amount);
        }
        if (sequenceIndex < 0) {
            throw new IllegalArgumentException("Posting sequenceIndex must be non-negative (>= 0), got: " + sequenceIndex);
        }
    }
}
