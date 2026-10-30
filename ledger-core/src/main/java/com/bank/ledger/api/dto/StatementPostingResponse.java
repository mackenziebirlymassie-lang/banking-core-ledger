package com.bank.ledger.api.dto;

import com.bank.ledger.domain.Direction;

import java.time.Instant;
import java.util.UUID;

/**
 * Account statement posting line including running balance.
 */
public record StatementPostingResponse(
    UUID id,
    UUID transactionId,
    long sequenceNum,
    String description,
    Instant postedAt,
    Direction direction,
    long amountMinor,
    String amountFormatted,
    long runningBalanceMinor,
    String runningBalanceFormatted
) {
}
