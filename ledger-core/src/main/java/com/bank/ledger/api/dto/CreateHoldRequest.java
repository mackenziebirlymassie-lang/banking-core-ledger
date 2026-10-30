package com.bank.ledger.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.UUID;

/**
 * Request DTO for creating a two-phase authorization hold.
 */
public record CreateHoldRequest(
    @NotBlank(message = "Description must not be blank")
    String description,

    @NotNull(message = "sourceAccountId must not be null")
    UUID sourceAccountId,

    @NotNull(message = "destinationAccountId must not be null")
    UUID destinationAccountId,

    @Positive(message = "amountMinor must be strictly positive")
    long amountMinor
) {
}
