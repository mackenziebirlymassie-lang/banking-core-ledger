package com.bank.ledger.api;

import com.bank.ledger.api.dto.TransactionResponse;
import com.bank.ledger.domain.Account;
import com.bank.ledger.exception.LedgerException;
import com.bank.ledger.repository.AccountRepository;
import com.bank.ledger.repository.LedgerTransactionRepository;
import com.bank.ledger.repository.LedgerTransactionRepository.TransactionRecord;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Controller for cursor-paginated transaction retrieval and audit chain exploration.
 */
@RestController
@RequestMapping("/api/v1/transactions")
public class TransactionController {

    private final LedgerTransactionRepository transactionRepository;
    private final AccountRepository accountRepository;

    public TransactionController(
        LedgerTransactionRepository transactionRepository,
        AccountRepository accountRepository
    ) {
        this.transactionRepository = transactionRepository;
        this.accountRepository = accountRepository;
    }

    @GetMapping
    public ResponseEntity<List<TransactionResponse>> getTransactions(
        @RequestParam(name = "limit", defaultValue = "50") int limit,
        @RequestParam(name = "afterSequence", defaultValue = "0") long afterSequence
    ) {
        List<Account> accounts = accountRepository.findAll();
        Map<UUID, String> accountNumbers = accounts.stream()
            .collect(Collectors.toMap(Account::getId, Account::getAccountNumber, (a, b) -> a));
        Map<UUID, String> accountCurrencies = accounts.stream()
            .collect(Collectors.toMap(Account::getId, Account::getCurrency, (a, b) -> a));

        List<TransactionRecord> records = transactionRepository.findTransactions(limit, afterSequence);

        List<TransactionResponse> responses = records.stream()
            .map(r -> TransactionResponse.fromRecord(r, accountNumbers, accountCurrencies))
            .toList();

        return ResponseEntity.ok(responses);
    }

    @GetMapping("/{id}")
    public ResponseEntity<TransactionResponse> getTransactionById(@PathVariable("id") UUID id) {
        TransactionRecord record = transactionRepository.findById(id)
            .orElseThrow(() -> new LedgerException("Transaction not found: " + id));

        List<Account> accounts = accountRepository.findAll();
        Map<UUID, String> accountNumbers = accounts.stream()
            .collect(Collectors.toMap(Account::getId, Account::getAccountNumber, (a, b) -> a));
        Map<UUID, String> accountCurrencies = accounts.stream()
            .collect(Collectors.toMap(Account::getId, Account::getCurrency, (a, b) -> a));

        return ResponseEntity.ok(TransactionResponse.fromRecord(record, accountNumbers, accountCurrencies));
    }
}
