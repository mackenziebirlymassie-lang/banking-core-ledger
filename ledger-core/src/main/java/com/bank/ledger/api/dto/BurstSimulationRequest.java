package com.bank.ledger.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * Configuration parameters for the Virtual Thread load simulator.
 */
public record BurstSimulationRequest(
    @Min(value = 1, message = "transactionCount must be at least 1")
    @Max(value = 5000, message = "transactionCount cannot exceed 5000 per burst")
    Integer transactionCount,

    @Min(value = 1, message = "concurrency must be at least 1")
    @Max(value = 200, message = "concurrency cannot exceed 200 virtual threads")
    Integer concurrency
) {
    public int effectiveCount() {
        return transactionCount != null ? transactionCount : 100;
    }

    public int effectiveConcurrency() {
        return concurrency != null ? concurrency : 20;
    }
}
