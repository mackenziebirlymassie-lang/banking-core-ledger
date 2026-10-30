package com.bank.ledger.api.dto;

import com.bank.ledger.domain.Direction;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.UUID;

/**
 * Leg definition for multi-leg double-entry transfers.
 */
public record PostingLegRequest(
    @NotNull(message = "accountId is required")
    UUID accountId,

    @Positive(message = "amountMinor must be strictly positive")
    long amountMinor,

    @NotNull(message = "direction is required (DEBIT or CREDIT)")
    Direction direction
) {
}
