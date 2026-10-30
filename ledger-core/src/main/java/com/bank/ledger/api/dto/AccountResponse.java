package com.bank.ledger.api.dto;

import com.bank.ledger.domain.Account;
import com.bank.ledger.domain.AccountType;
import com.bank.ledger.domain.Direction;

import java.util.UUID;

/**
 * Account DTO exposing both raw minor units and pre-formatted currency representations.
 */
public record AccountResponse(
    UUID id,
    String accountNumber,
    String currency,
    AccountType type,
    boolean allowNegativeBalance,
    long version,
    long postedDebitsMinor,
    long postedCreditsMinor,
    long pendingDebitsMinor,
    long pendingCreditsMinor,
    long postedBalanceMinor,
    String postedBalanceFormatted,
    long pendingBalanceMinor,
    String pendingBalanceFormatted,
    long availableBalanceMinor,
    String availableBalanceFormatted,
    Direction normalBalanceDirection
) {
    public static AccountResponse fromDomain(Account acc) {
        long posted = acc.getPostedBalance();
        long pending = acc.getPendingBalance();
        long available = acc.getAvailableBalance();
        String curr = acc.getCurrency();

        return new AccountResponse(
            acc.getId(),
            acc.getAccountNumber(),
            curr,
            acc.getType(),
            acc.isAllowNegativeBalance(),
            acc.getVersion(),
            acc.getPostedDebits(),
            acc.getPostedCredits(),
            acc.getPendingDebits(),
            acc.getPendingCredits(),
            posted,
            MoneyFormatter.format(posted, curr),
            pending,
            MoneyFormatter.format(pending, curr),
            available,
            MoneyFormatter.format(available, curr),
            acc.getType().isDebitNormal() ? Direction.DEBIT : Direction.CREDIT
        );
    }
}
