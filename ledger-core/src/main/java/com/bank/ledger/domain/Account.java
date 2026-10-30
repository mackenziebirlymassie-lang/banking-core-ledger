package com.bank.ledger.domain;

import java.util.Currency;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Thread-safe financial account entity representing an account on the chart of accounts.
 * Balances are strictly updated through double-entry postings inside deterministic locks.
 */
public final class Account {

    private final UUID id;
    private final String accountNumber;
    private final String currency;
    private final AccountType type;
    private final boolean allowNegativeBalance;

    private final AtomicLong version;
    private final AtomicLong postedDebits;
    private final AtomicLong postedCredits;
    private final AtomicLong pendingDebits;
    private final AtomicLong pendingCredits;

    public Account(
        UUID id,
        String accountNumber,
        String currency,
        AccountType type,
        boolean allowNegativeBalance
    ) {
        this(id, accountNumber, currency, type, allowNegativeBalance, 0L, 0L, 0L, 0L, 0L);
    }

    /**
     * Hydration constructor for reconstructing persistent account state.
     */
    public Account(
        UUID id,
        String accountNumber,
        String currency,
        AccountType type,
        boolean allowNegativeBalance,
        long postedDebits,
        long postedCredits,
        long pendingDebits,
        long pendingCredits,
        long version
    ) {
        this.id = Objects.requireNonNull(id, "Account id must not be null");
        this.accountNumber = Objects.requireNonNull(accountNumber, "accountNumber must not be null");
        this.currency = validateCurrency(currency);
        this.type = Objects.requireNonNull(type, "accountType must not be null");
        this.allowNegativeBalance = allowNegativeBalance;

        this.version = new AtomicLong(version);
        this.postedDebits = new AtomicLong(postedDebits);
        this.postedCredits = new AtomicLong(postedCredits);
        this.pendingDebits = new AtomicLong(pendingDebits);
        this.pendingCredits = new AtomicLong(pendingCredits);
    }

    private static String validateCurrency(String code) {
        Objects.requireNonNull(code, "currency code must not be null");
        String trimmed = code.trim().toUpperCase();
        try {
            Currency.getInstance(trimmed);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid ISO-4217 currency code: " + code, e);
        }
        return trimmed;
    }

    public UUID getId() {
        return id;
    }

    public String getAccountNumber() {
        return accountNumber;
    }

    public String getCurrency() {
        return currency;
    }

    public AccountType getType() {
        return type;
    }

    public boolean isAllowNegativeBalance() {
        return allowNegativeBalance;
    }

    public long getVersion() {
        return version.get();
    }

    public long getPostedDebits() {
        return postedDebits.get();
    }

    public long getPostedCredits() {
        return postedCredits.get();
    }

    public long getPendingDebits() {
        return pendingDebits.get();
    }

    public long getPendingCredits() {
        return pendingCredits.get();
    }

    /**
     * Net settled/posted balance based on normal balance accounting rules.
     * For ASSET and EXPENSE: debits - credits
     * For LIABILITY, EQUITY, and REVENUE: credits - debits
     */
    public long getPostedBalance() {
        long debits = postedDebits.get();
        long credits = postedCredits.get();
        return type.isDebitNormal() ? (debits - credits) : (credits - debits);
    }

    /**
     * Active held pending balance.
     */
    public long getPendingBalance() {
        return type.isDebitNormal() ? pendingCredits.get() : pendingDebits.get();
    }

    /**
     * Available balance taking into account active PENDING holds.
     * Outflows held in PENDING reduce available funds.
     */
    public long getAvailableBalance() {
        long posted = getPostedBalance();
        if (type.isDebitNormal()) {
            // For Asset/Expense, credits are outflows. Pending credits reduce available funds.
            return posted - pendingCredits.get();
        } else {
            // For Liability/Equity/Revenue, debits are outflows. Pending debits reduce available funds.
            return posted - pendingDebits.get();
        }
    }

    /**
     * Projected available balance if a new posting leg of given direction and amount is applied.
     */
    public long calculateProjectedAvailableBalance(Direction direction, long amount) {
        long current = getAvailableBalance();
        if (type.isDebitNormal()) {
            return direction == Direction.DEBIT ? current + amount : current - amount;
        } else {
            return direction == Direction.CREDIT ? current + amount : current - amount;
        }
    }

    /**
     * Projected available balance if a pending hold of given direction and amount is reserved.
     */
    public long calculateProjectedHoldAvailableBalance(Direction direction, long amount) {
        long current = getAvailableBalance();
        if (type.isDebitNormal()) {
            // If debit normal, holding a CREDIT reduces availability
            return direction == Direction.CREDIT ? current - amount : current;
        } else {
            // If credit normal, holding a DEBIT reduces availability
            return direction == Direction.DEBIT ? current - amount : current;
        }
    }

    // --- Engine-managed mutation methods strictly invoked under per-account transaction lock ---

    public void applyPosting(Direction direction, long amount) {
        if (direction == Direction.DEBIT) {
            postedDebits.addAndGet(amount);
        } else {
            postedCredits.addAndGet(amount);
        }
        version.incrementAndGet();
    }

    public void applyPendingHold(Direction direction, long amount) {
        if (direction == Direction.DEBIT) {
            pendingDebits.addAndGet(amount);
        } else {
            pendingCredits.addAndGet(amount);
        }
        version.incrementAndGet();
    }

    public void releasePendingHold(Direction direction, long amount) {
        if (direction == Direction.DEBIT) {
            pendingDebits.addAndGet(-amount);
        } else {
            pendingCredits.addAndGet(-amount);
        }
        version.incrementAndGet();
    }

    public void settlePendingHold(Direction direction, long amount) {
        if (direction == Direction.DEBIT) {
            pendingDebits.addAndGet(-amount);
            postedDebits.addAndGet(amount);
        } else {
            pendingCredits.addAndGet(-amount);
            postedCredits.addAndGet(amount);
        }
        version.incrementAndGet();
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Account account)) return false;
        return Objects.equals(id, account.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }

    @Override
    public String toString() {
        return "Account{" +
            "id=" + id +
            ", accountNumber='" + accountNumber + '\'' +
            ", currency='" + currency + '\'' +
            ", type=" + type +
            ", allowNegativeBalance=" + allowNegativeBalance +
            ", postedBalance=" + getPostedBalance() +
            ", availableBalance=" + getAvailableBalance() +
            ", version=" + version.get() +
            '}';
    }
}
