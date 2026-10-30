package com.bank.ledger.api;

import com.bank.ledger.api.dto.AccountResponse;
import com.bank.ledger.api.dto.AccountStatementResponse;
import com.bank.ledger.api.dto.CreateAccountRequest;
import com.bank.ledger.api.dto.MoneyFormatter;
import com.bank.ledger.api.dto.StatementPostingResponse;
import com.bank.ledger.domain.Account;
import com.bank.ledger.domain.Direction;
import com.bank.ledger.exception.AccountNotFoundException;
import com.bank.ledger.repository.AccountRepository;
import com.bank.ledger.repository.LedgerTransactionRepository;
import com.bank.ledger.repository.LedgerTransactionRepository.StatementEntry;
import com.bank.ledger.repository.PostgresLedgerEngine;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * REST controller for account lifecycle and statement generation.
 */
@RestController
@RequestMapping("/api/v1/accounts")
public class AccountController {

    private final PostgresLedgerEngine engine;
    private final AccountRepository accountRepository;
    private final LedgerTransactionRepository transactionRepository;

    public AccountController(
        PostgresLedgerEngine engine,
        AccountRepository accountRepository,
        LedgerTransactionRepository transactionRepository
    ) {
        this.engine = engine;
        this.accountRepository = accountRepository;
        this.transactionRepository = transactionRepository;
    }

    @PostMapping
    public ResponseEntity<AccountResponse> createAccount(@Valid @RequestBody CreateAccountRequest request) {
        Account created = engine.createAccount(
            request.accountNumber(),
            request.currency(),
            request.type(),
            request.allowNegativeBalance()
        );
        return ResponseEntity.status(HttpStatus.CREATED).body(AccountResponse.fromDomain(created));
    }

    @GetMapping
    public ResponseEntity<List<AccountResponse>> listAccounts() {
        List<Account> accounts = accountRepository.findAll();
        List<AccountResponse> responses = accounts.stream().map(AccountResponse::fromDomain).toList();
        return ResponseEntity.ok(responses);
    }

    @GetMapping("/{id}")
    public ResponseEntity<AccountResponse> getAccount(@PathVariable("id") UUID id) {
        Account account = engine.getAccount(id).orElseThrow(() -> new AccountNotFoundException(id));
        return ResponseEntity.ok(AccountResponse.fromDomain(account));
    }

    @GetMapping("/{id}/statement")
    public ResponseEntity<AccountStatementResponse> getStatement(
        @PathVariable("id") UUID id,
        @RequestParam(name = "page", defaultValue = "1") int page,
        @RequestParam(name = "pageSize", defaultValue = "50") int pageSize
    ) {
        Account account = engine.getAccount(id).orElseThrow(() -> new AccountNotFoundException(id));
        int limit = Math.max(1, Math.min(pageSize, 200));
        int offset = (Math.max(1, page) - 1) * limit;

        List<StatementEntry> entries = transactionRepository.findStatementEntries(id, limit, offset);
        long totalEntries = transactionRepository.countStatementEntries(id);

        boolean isDebitNormal = account.getType().isDebitNormal();
        String currency = account.getCurrency();

        List<StatementPostingResponse> lineItems = new ArrayList<>();
        long runningBalance = 0L;

        for (StatementEntry entry : entries) {
            long delta = 0L;
            if (isDebitNormal) {
                delta = entry.direction() == Direction.DEBIT ? entry.amount() : -entry.amount();
            } else {
                delta = entry.direction() == Direction.CREDIT ? entry.amount() : -entry.amount();
            }
            runningBalance += delta;

            lineItems.add(new StatementPostingResponse(
                entry.postingId(),
                entry.transactionId(),
                entry.sequenceNum(),
                entry.description(),
                entry.postedAt(),
                entry.direction(),
                entry.amount(),
                MoneyFormatter.format(entry.amount(), currency),
                runningBalance,
                MoneyFormatter.format(runningBalance, currency)
            ));
        }

        AccountStatementResponse response = new AccountStatementResponse(
            AccountResponse.fromDomain(account),
            lineItems,
            totalEntries,
            page,
            limit
        );

        return ResponseEntity.ok(response);
    }
}
