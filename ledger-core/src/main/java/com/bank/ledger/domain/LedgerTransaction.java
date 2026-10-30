package com.bank.ledger.domain;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * An immutable ledger transaction containing balanced double-entry postings.
 *
 * @param id             unique transaction identifier
 * @param idempotencyKey client-provided key ensuring exactly-once processing
 * @param description    audit description of the business event
 * @param postedAt       timestamp when the transaction was finalized
 * @param status         PENDING, POSTED, or VOIDED
 * @param postings       immutable list of balanced posting legs (minimum 2)
 * @param hash           SHA-256 cryptographic hash of the transaction and previous hash
 */
public record LedgerTransaction(
    UUID id,
    String idempotencyKey,
    String description,
    Instant postedAt,
    TransferStatus status,
    List<Posting> postings,
    String hash
) {
    public LedgerTransaction {
        Objects.requireNonNull(id, "LedgerTransaction id must not be null");
        Objects.requireNonNull(idempotencyKey, "idempotencyKey must not be null");
        Objects.requireNonNull(description, "description must not be null");
        Objects.requireNonNull(postedAt, "postedAt must not be null");
        Objects.requireNonNull(status, "status must not be null");
        Objects.requireNonNull(postings, "postings list must not be null");
        Objects.requireNonNull(hash, "transaction hash must not be null");

        // Defensive unmodifiable copy
        postings = List.copyOf(postings);
    }
}
