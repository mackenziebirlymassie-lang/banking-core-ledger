package com.bank.ledger.api.dto;

import com.bank.ledger.domain.LedgerTransaction;
import com.bank.ledger.domain.TransferStatus;
import com.bank.ledger.repository.LedgerTransactionRepository.TransactionRecord;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Complete Ledger Transaction response DTO including cryptographic chain parameters.
 */
public record TransactionResponse(
    UUID id,
    long sequenceNum,
    String idempotencyKey,
    String description,
    TransferStatus status,
    Instant postedAt,
    String prevHash,
    String hash,
    List<PostingResponse> postings
) {
    public static TransactionResponse fromDomain(
        LedgerTransaction tx,
        long sequenceNum,
        String prevHash,
        Map<UUID, String> accountNumbers,
        Map<UUID, String> accountCurrencies
    ) {
        List<PostingResponse> postingResponses = tx.postings().stream().map(p -> {
            String accNum = accountNumbers != null ? accountNumbers.getOrDefault(p.accountId(), p.accountId().toString()) : p.accountId().toString();
            String currency = accountCurrencies != null ? accountCurrencies.getOrDefault(p.accountId(), "USD") : "USD";
            return PostingResponse.fromDomain(p, accNum, currency);
        }).toList();

        return new TransactionResponse(
            tx.id(),
            sequenceNum,
            tx.idempotencyKey(),
            tx.description(),
            tx.status(),
            tx.postedAt(),
            prevHash,
            tx.hash(),
            postingResponses
        );
    }

    public static TransactionResponse fromRecord(
        TransactionRecord record,
        Map<UUID, String> accountNumbers,
        Map<UUID, String> accountCurrencies
    ) {
        return fromDomain(
            record.transaction(),
            record.sequenceNum(),
            record.prevHash(),
            accountNumbers,
            accountCurrencies
        );
    }
}
