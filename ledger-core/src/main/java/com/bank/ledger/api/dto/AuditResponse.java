package com.bank.ledger.api.dto;

import com.bank.ledger.wal.AuditVerificationReport;

import java.util.UUID;

/**
 * DTO representing the outcome of a cryptographic audit check.
 */
public record AuditResponse(
    boolean valid,
    long totalTransactionsScanned,
    String merkleRoot,
    long executionTimeMs,
    Long corruptedSequenceNum,
    UUID corruptedTransactionId,
    String failureReason
) {
    public static AuditResponse fromReport(AuditVerificationReport report, long durationMs) {
        Long corruptedSeq = report.corruptedSequenceNum() != null && report.corruptedSequenceNum() > 0
            ? report.corruptedSequenceNum()
            : null;

        return new AuditResponse(
            report.valid(),
            report.totalTransactionsScanned(),
            report.calculatedMerkleRoot(),
            durationMs,
            corruptedSeq,
            report.corruptedTransactionId(),
            report.failureReason()
        );
    }
}
