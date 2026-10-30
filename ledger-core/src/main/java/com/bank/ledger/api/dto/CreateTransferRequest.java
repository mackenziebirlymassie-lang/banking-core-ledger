package com.bank.ledger.api.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;
import java.util.UUID;

/**
 * Transfer request DTO supporting both simple 2-leg transfers and arbitrary multi-leg postings.
 */
public record CreateTransferRequest(
    @NotBlank(message = "Transfer description must not be blank")
    String description,

    UUID sourceAccountId,
    UUID destinationAccountId,
    Long amountMinor,
    List<PostingLegRequest> legs
) {
    public boolean isSimpleTransfer() {
        return sourceAccountId != null && destinationAccountId != null && amountMinor != null && amountMinor > 0;
    }

    public boolean isMultiLeg() {
        return legs != null && legs.size() >= 2;
    }
}
