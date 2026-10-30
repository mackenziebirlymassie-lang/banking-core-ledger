package com.bank.ledger.domain;

/**
 * Double-entry posting direction.
 */
public enum Direction {
    DEBIT,
    CREDIT;

    public Direction opposite() {
        return this == DEBIT ? CREDIT : DEBIT;
    }
}
