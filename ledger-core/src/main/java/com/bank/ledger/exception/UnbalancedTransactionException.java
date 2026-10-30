package com.bank.ledger.exception;

/**
 * Thrown when the sum of debits does not equal the sum of credits in a transaction.
 */
public class UnbalancedTransactionException extends LedgerException {

    private final long totalDebits;
    private final long totalCredits;
    private final long discrepancy;

    public UnbalancedTransactionException(long totalDebits, long totalCredits) {
        super(String.format(
            "Transaction is unbalanced: total debits (%d) - total credits (%d) = discrepancy (%d). Invariant requires discrepancy to be 0.",
            totalDebits, totalCredits, Math.abs(totalDebits - totalCredits)
        ));
        this.totalDebits = totalDebits;
        this.totalCredits = totalCredits;
        this.discrepancy = Math.abs(totalDebits - totalCredits);
    }

    public long getTotalDebits() {
        return totalDebits;
    }

    public long getTotalCredits() {
        return totalCredits;
    }

    public long getDiscrepancy() {
        return discrepancy;
    }
}
