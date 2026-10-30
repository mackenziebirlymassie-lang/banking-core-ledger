package com.bank.ledger.api.dto;

import com.bank.ledger.domain.Direction;
import com.bank.ledger.domain.Posting;

import java.util.UUID;

/**
 * Posting leg representation with formatted monetary values.
 */
public record PostingResponse(
    UUID id,
    UUID transactionId,
    UUID accountId,
    String accountNumber,
    long amountMinor,
    String amountFormatted,
    Direction direction,
    int sequenceIndex
) {
    public static PostingResponse fromDomain(Posting posting, String accountNumber, String currency) {
        return new PostingResponse(
            posting.id(),
            posting.transactionId(),
            posting.accountId(),
            accountNumber,
            posting.amount(),
            MoneyFormatter.format(posting.amount(), currency),
            posting.direction(),
            posting.sequenceIndex()
        );
    }
}
