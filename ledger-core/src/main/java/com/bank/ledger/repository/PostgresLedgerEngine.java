package com.bank.ledger.repository;

import com.bank.ledger.crypto.HashChainService;
import com.bank.ledger.domain.Account;
import com.bank.ledger.domain.AccountType;
import com.bank.ledger.domain.Direction;
import com.bank.ledger.domain.LedgerTransaction;
import com.bank.ledger.domain.Posting;
import com.bank.ledger.domain.TransferStatus;
import com.bank.ledger.engine.LedgerValidator;
import com.bank.ledger.exception.AccountNotFoundException;
import com.bank.ledger.exception.IdempotencyConflictException;
import com.bank.ledger.exception.LedgerException;
import com.bank.ledger.wal.BinaryWalWriter;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Enterprise PostgreSQL-backed Core Banking Ledger Engine.
 * Combines database-level pessimistic row locking, optimistic versioning,
 * tamper-evident SHA-256 hash chains, and binary Write-Ahead Log (WAL) durability.
 */
public class PostgresLedgerEngine {

    private final AccountRepository accountRepository;
    private final LedgerTransactionRepository transactionRepository;
    private final BinaryWalWriter walWriter;
    private final TransactionTemplate transactionTemplate;
    private volatile LedgerEventListener eventListener;

    @FunctionalInterface
    public interface LedgerEventListener {
        void onTransactionCommitted(LedgerTransaction tx, List<Account> affectedAccounts);
    }

    public record ExecutionResult<T>(T result, boolean isReplay) {}

    public PostgresLedgerEngine(
        AccountRepository accountRepository,
        LedgerTransactionRepository transactionRepository,
        BinaryWalWriter walWriter,
        PlatformTransactionManager transactionManager
    ) {
        this.accountRepository = Objects.requireNonNull(accountRepository, "accountRepository must not be null");
        this.transactionRepository = Objects.requireNonNull(transactionRepository, "transactionRepository must not be null");
        this.walWriter = walWriter; // Optional local WAL writer
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public void setEventListener(LedgerEventListener eventListener) {
        this.eventListener = eventListener;
    }

    public Account createAccount(
        String accountNumber,
        String currency,
        AccountType type,
        boolean allowNegativeBalance
    ) {
        return createAccount(UUID.randomUUID(), accountNumber, currency, type, allowNegativeBalance);
    }

    public Account createAccount(
        UUID id,
        String accountNumber,
        String currency,
        AccountType type,
        boolean allowNegativeBalance
    ) {
        Account account = new Account(id, accountNumber, currency, type, allowNegativeBalance);
        accountRepository.insert(account);
        return account;
    }

    public Optional<Account> getAccount(UUID id) {
        return accountRepository.findById(id);
    }

    /**
     * Executes a single-phase atomic transfer from source to destination account.
     */
    public LedgerTransaction transfer(
        String idempotencyKey,
        String description,
        UUID sourceAccountId,
        UUID destinationAccountId,
        long amount
    ) {
        return transferWithResult(idempotencyKey, description, sourceAccountId, destinationAccountId, amount).result();
    }

    public ExecutionResult<LedgerTransaction> transferWithResult(
        String idempotencyKey,
        String description,
        UUID sourceAccountId,
        UUID destinationAccountId,
        long amount
    ) {
        UUID txId = UUID.randomUUID();
        List<Posting> postings = List.of(
            new Posting(UUID.randomUUID(), txId, sourceAccountId, amount, Direction.CREDIT, 0),
            new Posting(UUID.randomUUID(), txId, destinationAccountId, amount, Direction.DEBIT, 1)
        );

        return postTransactionWithResult(idempotencyKey, description, postings, txId);
    }

    /**
     * Posts an atomic batch of double-entry postings with deterministic DB row locking.
     */
    public LedgerTransaction postTransaction(
        String idempotencyKey,
        String description,
        List<Posting> postings
    ) {
        return postTransaction(idempotencyKey, description, postings, UUID.randomUUID());
    }

    public LedgerTransaction postTransaction(
        String idempotencyKey,
        String description,
        List<Posting> postings,
        UUID transactionId
    ) {
        return postTransactionWithResult(idempotencyKey, description, postings, transactionId).result();
    }

    public ExecutionResult<LedgerTransaction> postTransactionWithResult(
        String idempotencyKey,
        String description,
        List<Posting> postings,
        UUID transactionId
    ) {
        return transactionTemplate.execute(status -> {
            // 1. Idempotency Check
            Optional<LedgerTransactionRepository.TransactionRecord> existing =
                transactionRepository.findByIdempotencyKey(idempotencyKey);

            if (existing.isPresent()) {
                LedgerTransaction existingTx = existing.get().transaction();
                verifyIdempotencyMatch(existingTx, description, postings);
                return new ExecutionResult<>(existingTx, true);
            }

            // 2. Deterministic Row-Locking: Lock all involved accounts in ascending natural UUID order
            List<UUID> accountIds = postings.stream()
                .map(Posting::accountId)
                .distinct()
                .sorted(Comparator.naturalOrder())
                .toList();

            List<Account> lockedAccounts = accountRepository.lockAccountsForUpdate(accountIds);
            Map<UUID, Account> accountMap = lockedAccounts.stream()
                .collect(Collectors.toMap(Account::getId, Function.identity()));

            if (accountMap.size() != accountIds.size()) {
                for (UUID id : accountIds) {
                    if (!accountMap.containsKey(id)) {
                        throw new AccountNotFoundException(id);
                    }
                }
            }

            // 3. Invariant and Funds Validation
            LedgerValidator.validateTransactionStructure(postings, accountMap);
            for (Posting p : postings) {
                LedgerValidator.validateSufficientFunds(p, accountMap.get(p.accountId()));
            }

            // 4. Update In-Memory & Database Account Balances with Optimistic Versioning
            for (Posting p : postings) {
                Account acc = accountMap.get(p.accountId());
                long expectedVersion = acc.getVersion();
                acc.applyPosting(p.direction(), p.amount());

                boolean updated = accountRepository.updateBalances(acc, expectedVersion);
                if (!updated) {
                    throw new LedgerException("Optimistic lock failure while updating account " + acc.getId());
                }
            }

            // 5. Cryptographic Hash Chain Calculation
            Optional<LedgerTransactionRepository.TransactionRecord> latest = transactionRepository.findLatestTransaction();
            String prevHash = latest.map(r -> r.transaction().hash()).orElse(HashChainService.GENESIS_PREV_HASH);
            long sequenceNum = latest.map(r -> r.sequenceNum() + 1).orElse(1L);

            Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
            String payloadHash = HashChainService.computePayloadHash(postings);
            String hash = HashChainService.computeTransactionHash(
                prevHash, transactionId, idempotencyKey, TransferStatus.POSTED, now, payloadHash
            );

            LedgerTransaction tx = new LedgerTransaction(
                transactionId,
                idempotencyKey,
                description,
                now,
                TransferStatus.POSTED,
                postings,
                hash
            );

            // 6. Persist Transaction and Postings
            transactionRepository.insertTransaction(tx, prevHash, payloadHash);
            transactionRepository.insertPostings(postings);

            // 7. Write to Binary WAL
            if (walWriter != null) {
                try {
                    byte[] payload = String.format("%s:%s:%s", transactionId, idempotencyKey, payloadHash)
                        .getBytes(StandardCharsets.UTF_8);
                    walWriter.append(sequenceNum, prevHash, hash, payload);
                } catch (IOException e) {
                    throw new LedgerException("Failed to persist WAL frame for transaction " + transactionId, e);
                }
            }

            if (eventListener != null) {
                eventListener.onTransactionCommitted(tx, new java.util.ArrayList<>(accountMap.values()));
            }

            return new ExecutionResult<>(tx, false);
        });
    }

    /**
     * Authorizes a two-phase transfer hold.
     */
    public LedgerTransaction authorizeHold(
        String idempotencyKey,
        String description,
        UUID sourceAccountId,
        UUID destinationAccountId,
        long amount
    ) {
        return authorizeHoldWithResult(idempotencyKey, description, sourceAccountId, destinationAccountId, amount).result();
    }

    public ExecutionResult<LedgerTransaction> authorizeHoldWithResult(
        String idempotencyKey,
        String description,
        UUID sourceAccountId,
        UUID destinationAccountId,
        long amount
    ) {
        return transactionTemplate.execute(status -> {
            Optional<LedgerTransactionRepository.TransactionRecord> existing =
                transactionRepository.findByIdempotencyKey(idempotencyKey);

            if (existing.isPresent()) {
                LedgerTransaction existingTx = existing.get().transaction();
                if (!existingTx.description().equals(description)) {
                    throw new IdempotencyConflictException(
                        existingTx.idempotencyKey(),
                        String.format("Description mismatch: expected '%s', got '%s'", existingTx.description(), description)
                    );
                }
                return new ExecutionResult<>(existingTx, true);
            }

            List<UUID> accountIds = List.of(sourceAccountId, destinationAccountId).stream()
                .distinct().sorted(Comparator.naturalOrder()).toList();

            List<Account> lockedAccounts = accountRepository.lockAccountsForUpdate(accountIds);
            Map<UUID, Account> accountMap = lockedAccounts.stream()
                .collect(Collectors.toMap(Account::getId, Function.identity()));

            if (accountMap.size() != accountIds.size()) {
                for (UUID id : accountIds) {
                    if (!accountMap.containsKey(id)) {
                        throw new AccountNotFoundException(id);
                    }
                }
            }

            Account sourceAcc = accountMap.get(sourceAccountId);
            Direction sourceDir = sourceAcc.getType().isDebitNormal() ? Direction.CREDIT : Direction.DEBIT;
            Direction destDir = (sourceDir == Direction.CREDIT) ? Direction.DEBIT : Direction.CREDIT;

            UUID txId = UUID.randomUUID();
            List<Posting> postings = List.of(
                new Posting(UUID.randomUUID(), txId, sourceAccountId, amount, sourceDir, 0),
                new Posting(UUID.randomUUID(), txId, destinationAccountId, amount, destDir, 1)
            );

            LedgerValidator.validateTransactionStructure(postings, accountMap);
            for (Posting p : postings) {
                LedgerValidator.validateHoldSufficientFunds(p.direction(), p.amount(), accountMap.get(p.accountId()));
            }

            for (Posting p : postings) {
                Account acc = accountMap.get(p.accountId());
                long expectedVersion = acc.getVersion();
                acc.applyPendingHold(p.direction(), p.amount());
                accountRepository.updateBalances(acc, expectedVersion);
            }

            Optional<LedgerTransactionRepository.TransactionRecord> latest = transactionRepository.findLatestTransaction();
            String prevHash = latest.map(r -> r.transaction().hash()).orElse(HashChainService.GENESIS_PREV_HASH);
            long sequenceNum = latest.map(r -> r.sequenceNum() + 1).orElse(1L);

            Instant now = Instant.now().truncatedTo(ChronoUnit.MILLIS);
            String payloadHash = HashChainService.computePayloadHash(postings);
            String hash = HashChainService.computeTransactionHash(
                prevHash, txId, idempotencyKey, TransferStatus.PENDING, now, payloadHash
            );

            LedgerTransaction holdTx = new LedgerTransaction(
                txId, idempotencyKey, description, now, TransferStatus.PENDING, postings, hash
            );

            transactionRepository.insertTransaction(holdTx, prevHash, payloadHash);
            transactionRepository.insertPostings(postings);

            if (walWriter != null) {
                try {
                    byte[] payload = String.format("%s:%s:%s", txId, idempotencyKey, payloadHash)
                        .getBytes(StandardCharsets.UTF_8);
                    walWriter.append(sequenceNum, prevHash, hash, payload);
                } catch (IOException e) {
                    throw new LedgerException("Failed to persist WAL hold frame", e);
                }
            }

            if (eventListener != null) {
                eventListener.onTransactionCommitted(holdTx, new java.util.ArrayList<>(accountMap.values()));
            }

            return new ExecutionResult<>(holdTx, false);
        });
    }

    /**
     * Settles a pending hold, moving funds from pending to posted atomically.
     */
    public LedgerTransaction settleHold(UUID holdTransactionId) {
        return settleHoldWithResult(holdTransactionId).result();
    }

    public ExecutionResult<LedgerTransaction> settleHoldWithResult(UUID holdTransactionId) {
        return transactionTemplate.execute(status -> {
            LedgerTransactionRepository.TransactionRecord record = transactionRepository.findById(holdTransactionId)
                .orElseThrow(() -> new LedgerException("Hold transaction not found: " + holdTransactionId));

            LedgerTransaction holdTx = record.transaction();
            if (holdTx.status() == TransferStatus.POSTED) {
                return new ExecutionResult<>(holdTx, true);
            }
            if (holdTx.status() != TransferStatus.PENDING) {
                throw new LedgerException("Transaction " + holdTransactionId + " is not in PENDING status: " + holdTx.status());
            }

            List<UUID> accountIds = holdTx.postings().stream()
                .map(Posting::accountId).distinct().sorted(Comparator.naturalOrder()).toList();

            List<Account> locked = accountRepository.lockAccountsForUpdate(accountIds);
            Map<UUID, Account> map = locked.stream().collect(Collectors.toMap(Account::getId, Function.identity()));

            for (Posting p : holdTx.postings()) {
                Account acc = map.get(p.accountId());
                long expectedVer = acc.getVersion();
                acc.settlePendingHold(p.direction(), p.amount());
                accountRepository.updateBalances(acc, expectedVer);
            }

            String settledHash = holdTx.hash();
            transactionRepository.updateTransactionStatus(holdTransactionId, TransferStatus.POSTED, settledHash);

            LedgerTransaction settledTx = new LedgerTransaction(
                holdTx.id(),
                holdTx.idempotencyKey(),
                holdTx.description() + " [SETTLED]",
                holdTx.postedAt(),
                TransferStatus.POSTED,
                holdTx.postings(),
                settledHash
            );

            if (eventListener != null) {
                eventListener.onTransactionCommitted(settledTx, new java.util.ArrayList<>(map.values()));
            }

            return new ExecutionResult<>(settledTx, false);
        });
    }

    /**
     * Voids an active hold, releasing reserved funds back to available balance.
     */
    public LedgerTransaction voidHold(UUID holdTransactionId) {
        return voidHoldWithResult(holdTransactionId).result();
    }

    public ExecutionResult<LedgerTransaction> voidHoldWithResult(UUID holdTransactionId) {
        return transactionTemplate.execute(status -> {
            LedgerTransactionRepository.TransactionRecord record = transactionRepository.findById(holdTransactionId)
                .orElseThrow(() -> new LedgerException("Hold transaction not found: " + holdTransactionId));

            LedgerTransaction holdTx = record.transaction();
            if (holdTx.status() == TransferStatus.VOIDED) {
                return new ExecutionResult<>(holdTx, true);
            }
            if (holdTx.status() != TransferStatus.PENDING) {
                throw new LedgerException("Transaction " + holdTransactionId + " is not in PENDING status: " + holdTx.status());
            }

            List<UUID> accountIds = holdTx.postings().stream()
                .map(Posting::accountId).distinct().sorted(Comparator.naturalOrder()).toList();

            List<Account> locked = accountRepository.lockAccountsForUpdate(accountIds);
            Map<UUID, Account> map = locked.stream().collect(Collectors.toMap(Account::getId, Function.identity()));

            for (Posting p : holdTx.postings()) {
                Account acc = map.get(p.accountId());
                long expectedVer = acc.getVersion();
                acc.releasePendingHold(p.direction(), p.amount());
                accountRepository.updateBalances(acc, expectedVer);
            }

            String voidedHash = holdTx.hash();
            transactionRepository.updateTransactionStatus(holdTransactionId, TransferStatus.VOIDED, voidedHash);

            LedgerTransaction voidedTx = new LedgerTransaction(
                holdTx.id(),
                holdTx.idempotencyKey(),
                holdTx.description() + " [VOIDED]",
                holdTx.postedAt(),
                TransferStatus.VOIDED,
                holdTx.postings(),
                voidedHash
            );

            if (eventListener != null) {
                eventListener.onTransactionCommitted(voidedTx, new java.util.ArrayList<>(map.values()));
            }

            return new ExecutionResult<>(voidedTx, false);
        });
    }

    private void verifyIdempotencyMatch(LedgerTransaction existing, String description, List<Posting> postings) {
        if (!existing.description().equals(description)) {
            throw new IdempotencyConflictException(
                existing.idempotencyKey(),
                String.format("Description mismatch: expected '%s', got '%s'", existing.description(), description)
            );
        }
        if (existing.postings().size() != postings.size()) {
            throw new IdempotencyConflictException(
                existing.idempotencyKey(),
                String.format("Postings count mismatch: expected %d, got %d", existing.postings().size(), postings.size())
            );
        }
    }
}
