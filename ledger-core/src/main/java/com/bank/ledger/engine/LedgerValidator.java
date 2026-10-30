package com.bank.ledger.engine;

import com.bank.ledger.domain.Account;
import com.bank.ledger.domain.Direction;
import com.bank.ledger.domain.Posting;
import com.bank.ledger.exception.AccountNotFoundException;
import com.bank.ledger.exception.CurrencyMismatchException;
import com.bank.ledger.exception.InsufficientFundsException;
import com.bank.ledger.exception.UnbalancedTransactionException;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Validates double-entry invariants, currency coherence, and balance limits.
 */
public final class LedgerValidator {

    private LedgerValidator() {
        // Utility class
    }

    /**
     * Validates the structural integrity and double-entry balance of a posting batch.
     *
     * @param postings      the list of posting legs
     * @param accountLookup map of account IDs to Account entities
     * @throws UnbalancedTransactionException if sum(debits) != sum(credits)
     * @throws CurrencyMismatchException      if accounts in the transfer have mismatched currencies
     * @throws AccountNotFoundException       if an accountId is not in the lookup map
     */
    public static void validateTransactionStructure(
        List<Posting> postings,
        Map<UUID, Account> accountLookup
    ) {
        Objects.requireNonNull(postings, "postings list must not be null");
        Objects.requireNonNull(accountLookup, "accountLookup must not be null");

        if (postings.size() < 2) {
            throw new IllegalArgumentException(
                "A double-entry transaction must contain at least 2 postings, got: " + postings.size()
            );
        }

        long totalDebits = 0L;
        long totalCredits = 0L;
        String currency = null;

        for (Posting posting : postings) {
            Account account = accountLookup.get(posting.accountId());
            if (account == null) {
                throw new AccountNotFoundException(posting.accountId());
            }

            if (currency == null) {
                currency = account.getCurrency();
            } else if (!currency.equals(account.getCurrency())) {
                throw new CurrencyMismatchException(account.getId(), currency, account.getCurrency());
            }

            if (posting.direction() == Direction.DEBIT) {
                totalDebits += posting.amount();
            } else {
                totalCredits += posting.amount();
            }
        }

        if (totalDebits != totalCredits) {
            throw new UnbalancedTransactionException(totalDebits, totalCredits);
        }
    }

    /**
     * Validates that applying a posting will not cause the account's available balance
     * to drop below 0 if negative balances are prohibited.
     */
    public static void validateSufficientFunds(Posting posting, Account account) {
        if (!account.isAllowNegativeBalance()) {
            long projected = account.calculateProjectedAvailableBalance(posting.direction(), posting.amount());
            if (projected < 0L) {
                throw new InsufficientFundsException(
                    account.getId(),
                    account.getAvailableBalance(),
                    posting.amount()
                );
            }
        }
    }

    /**
     * Validates that placing a pending hold will not cause the account's available balance
     * to drop below 0 if negative balances are prohibited.
     */
    public static void validateHoldSufficientFunds(Direction direction, long amount, Account account) {
        if (!account.isAllowNegativeBalance()) {
            long projected = account.calculateProjectedHoldAvailableBalance(direction, amount);
            if (projected < 0L) {
                throw new InsufficientFundsException(
                    account.getId(),
                    account.getAvailableBalance(),
                    amount
                );
            }
        }
    }
}
