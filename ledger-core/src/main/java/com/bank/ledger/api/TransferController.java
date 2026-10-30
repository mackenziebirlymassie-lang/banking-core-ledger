package com.bank.ledger.api;

import com.bank.ledger.api.dto.CreateHoldRequest;
import com.bank.ledger.api.dto.CreateTransferRequest;
import com.bank.ledger.api.dto.PostingLegRequest;
import com.bank.ledger.api.dto.TransactionResponse;
import com.bank.ledger.domain.Account;
import com.bank.ledger.domain.Direction;
import com.bank.ledger.domain.LedgerTransaction;
import com.bank.ledger.domain.Posting;
import com.bank.ledger.exception.LedgerException;
import com.bank.ledger.repository.AccountRepository;
import com.bank.ledger.repository.LedgerTransactionRepository;
import com.bank.ledger.repository.PostgresLedgerEngine;
import com.bank.ledger.repository.PostgresLedgerEngine.ExecutionResult;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * High-performance transfer controller handling single-phase and two-phase transfers
 * with strict Idempotency header enforcement.
 */
@RestController
@RequestMapping("/api/v1/transfers")
public class TransferController {

    private final PostgresLedgerEngine engine;
    private final AccountRepository accountRepository;
    private final LedgerTransactionRepository transactionRepository;

    public TransferController(
        PostgresLedgerEngine engine,
        AccountRepository accountRepository,
        LedgerTransactionRepository transactionRepository
    ) {
        this.engine = engine;
        this.accountRepository = accountRepository;
        this.transactionRepository = transactionRepository;
    }

    @PostMapping
    public ResponseEntity<TransactionResponse> executeTransfer(
        @RequestHeader("Idempotency-Key") String idempotencyKey,
        @Valid @RequestBody CreateTransferRequest request
    ) {
        ExecutionResult<LedgerTransaction> execResult;

        if (request.isSimpleTransfer()) {
            Account source = accountRepository.findById(request.sourceAccountId())
                .orElseThrow(() -> new com.bank.ledger.exception.AccountNotFoundException(request.sourceAccountId()));
            Account dest = accountRepository.findById(request.destinationAccountId())
                .orElseThrow(() -> new com.bank.ledger.exception.AccountNotFoundException(request.destinationAccountId()));

            Direction sourceDir = source.getType().isDebitNormal() ? Direction.CREDIT : Direction.DEBIT;
            Direction destDir = (sourceDir == Direction.CREDIT) ? Direction.DEBIT : Direction.CREDIT;

            UUID txId = UUID.randomUUID();
            List<Posting> postings = List.of(
                new Posting(UUID.randomUUID(), txId, source.getId(), request.amountMinor(), sourceDir, 0),
                new Posting(UUID.randomUUID(), txId, dest.getId(), request.amountMinor(), destDir, 1)
            );
            execResult = engine.postTransactionWithResult(idempotencyKey.trim(), request.description(), postings, txId);
        } else if (request.isMultiLeg()) {
            UUID txId = UUID.randomUUID();
            List<Posting> postings = new ArrayList<>();
            for (int i = 0; i < request.legs().size(); i++) {
                PostingLegRequest leg = request.legs().get(i);
                postings.add(new Posting(
                    UUID.randomUUID(),
                    txId,
                    leg.accountId(),
                    leg.amountMinor(),
                    leg.direction(),
                    i
                ));
            }
            execResult = engine.postTransactionWithResult(idempotencyKey.trim(), request.description(), postings, txId);
        } else {
            throw new LedgerException("Invalid transfer payload: specify sourceAccountId, destinationAccountId and amountMinor OR provide at least 2 legs.");
        }

        TransactionResponse response = buildTransactionResponse(execResult.result());
        HttpStatus status = execResult.isReplay() ? HttpStatus.OK : HttpStatus.CREATED;
        return ResponseEntity.status(status).body(response);
    }

    @PostMapping("/hold")
    public ResponseEntity<TransactionResponse> authorizeHold(
        @RequestHeader("Idempotency-Key") String idempotencyKey,
        @Valid @RequestBody CreateHoldRequest request
    ) {
        ExecutionResult<LedgerTransaction> execResult = engine.authorizeHoldWithResult(
            idempotencyKey.trim(),
            request.description(),
            request.sourceAccountId(),
            request.destinationAccountId(),
            request.amountMinor()
        );

        TransactionResponse response = buildTransactionResponse(execResult.result());
        HttpStatus status = execResult.isReplay() ? HttpStatus.OK : HttpStatus.CREATED;
        return ResponseEntity.status(status).body(response);
    }

    @PostMapping("/{id}/settle")
    public ResponseEntity<TransactionResponse> settleHold(
        @RequestHeader("Idempotency-Key") String idempotencyKey,
        @PathVariable("id") UUID id
    ) {
        ExecutionResult<LedgerTransaction> execResult = engine.settleHoldWithResult(id);
        TransactionResponse response = buildTransactionResponse(execResult.result());
        return ResponseEntity.ok(response);
    }

    @PostMapping("/{id}/void")
    public ResponseEntity<TransactionResponse> voidHold(
        @RequestHeader("Idempotency-Key") String idempotencyKey,
        @PathVariable("id") UUID id
    ) {
        ExecutionResult<LedgerTransaction> execResult = engine.voidHoldWithResult(id);
        TransactionResponse response = buildTransactionResponse(execResult.result());
        return ResponseEntity.ok(response);
    }

    private TransactionResponse buildTransactionResponse(LedgerTransaction tx) {
        List<Account> allAccounts = accountRepository.findAll();
        Map<UUID, String> accountNumbers = allAccounts.stream()
            .collect(Collectors.toMap(Account::getId, Account::getAccountNumber, (a, b) -> a));
        Map<UUID, String> accountCurrencies = allAccounts.stream()
            .collect(Collectors.toMap(Account::getId, Account::getCurrency, (a, b) -> a));

        long seqNum = transactionRepository.findById(tx.id())
            .map(LedgerTransactionRepository.TransactionRecord::sequenceNum)
            .orElse(0L);

        return TransactionResponse.fromDomain(tx, seqNum, "HASH_CHAIN_NODE", accountNumbers, accountCurrencies);
    }
}
