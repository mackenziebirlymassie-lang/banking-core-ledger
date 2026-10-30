package com.bank.ledger.api.dto;

import java.util.List;

/**
 * Result metrics from a Virtual Thread burst simulation.
 */
public record BurstSimulationResponse(
    int transactionsInitiated,
    int transactionsSuccessful,
    int transactionsFailed,
    long durationMs,
    double throughputTps,
    String merkleRoot,
    List<String> errors
) {
}
