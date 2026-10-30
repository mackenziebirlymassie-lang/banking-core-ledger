package com.bank.ledger.domain;

/**
 * Standard double-entry accounting 5-category chart of accounts classification.
 */
public enum AccountType {
    ASSET,
    LIABILITY,
    EQUITY,
    REVENUE,
    EXPENSE;

    /**
     * @return true if normal balance increases with DEBIT (Assets and Expenses).
     */
    public boolean isDebitNormal() {
        return this == ASSET || this == EXPENSE;
    }

    /**
     * @return true if normal balance increases with CREDIT (Liabilities, Equity, Revenue).
     */
    public boolean isCreditNormal() {
        return !isDebitNormal();
    }
}
