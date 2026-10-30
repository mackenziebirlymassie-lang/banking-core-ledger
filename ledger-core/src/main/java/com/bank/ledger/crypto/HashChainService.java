package com.bank.ledger.crypto;

import com.bank.ledger.domain.Posting;
import com.bank.ledger.domain.TransferStatus;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Deterministic cryptographic hashing service for ledger transactions and audit chains.
 */
public final class HashChainService {

    public static final String GENESIS_PREV_HASH = "0".repeat(64);

    private HashChainService() {
        // Utility class
    }

    /**
     * Computes a canonical payload hash over the sorted postings list.
     * Postings are ordered strictly by sequenceIndex, then serialized as:
     * accountId:direction:amount:sequenceIndex joined by '|'
     */
    public static String computePayloadHash(List<Posting> postings) {
        Objects.requireNonNull(postings, "Postings list must not be null");
        List<Posting> sorted = postings.stream()
            .sorted(Comparator.comparingInt(Posting::sequenceIndex))
            .toList();

        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < sorted.size(); i++) {
            Posting p = sorted.get(i);
            if (i > 0) sb.append('|');
            sb.append(p.accountId())
              .append(':').append(p.direction())
              .append(':').append(p.amount())
              .append(':').append(p.sequenceIndex());
        }

        return sha256Hex(sb.toString());
    }

    /**
     * Computes the cryptographic transaction hash linking to the previous transaction's hash.
     * Input: prev_hash | transaction_id | idempotency_key | status | posted_at_epoch_nanos | payload_hash
     */
    public static String computeTransactionHash(
        String prevHash,
        UUID transactionId,
        String idempotencyKey,
        TransferStatus status,
        Instant postedAt,
        String payloadHash
    ) {
        Objects.requireNonNull(prevHash, "prevHash must not be null");
        Objects.requireNonNull(transactionId, "transactionId must not be null");
        Objects.requireNonNull(idempotencyKey, "idempotencyKey must not be null");
        Objects.requireNonNull(status, "status must not be null");
        Objects.requireNonNull(postedAt, "postedAt must not be null");
        Objects.requireNonNull(payloadHash, "payloadHash must not be null");

        // Use epoch nanoseconds for sub-microsecond precision
        long nanos = (postedAt.getEpochSecond() * 1_000_000_000L) + postedAt.getNano();

        String rawInput = String.join("|",
            prevHash,
            transactionId.toString(),
            idempotencyKey,
            status.name(),
            String.valueOf(nanos),
            payloadHash
        );

        return sha256Hex(rawInput);
    }

    /**
     * Calculates SHA-256 digest and returns a 64-character lowercase hex string.
     */
    public static String sha256Hex(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm not available", e);
        }
    }

    /**
     * Calculates SHA-256 digest of raw byte array.
     */
    public static byte[] sha256Bytes(byte[] input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return digest.digest(input);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm not available", e);
        }
    }
}
