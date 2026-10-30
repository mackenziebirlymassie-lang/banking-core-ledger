package com.bank.ledger.engine;

import com.bank.ledger.domain.Account;
import com.bank.ledger.domain.AccountType;
import com.bank.ledger.domain.Direction;
import com.bank.ledger.domain.LedgerTransaction;
import com.bank.ledger.domain.Posting;
import com.bank.ledger.domain.TransferStatus;
import com.bank.ledger.exception.AccountNotFoundException;
import com.bank.ledger.exception.IdempotencyConflictException;
import com.bank.ledger.exception.LedgerException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.Collectors;

/**
 * High-concurrency, deadlock-free double-entry ledger execution engine.
 * Supports single-phase atomic postings and two-phase transfers (authorize, settle, void).
 */
public class LedgerEngine {

    private final Map<UUID, Account> accounts = new ConcurrentHashMap<>();
    private final Map<UUID, ReentrantLock> accountLocks = new ConcurrentHashMap<>();
    private final Map<String, LedgerTransaction> idempotencyRegistry = new ConcurrentHashMap<>();
    private final Map<UUID, LedgerTransaction> transactions = new ConcurrentHashMap<>();
    private final Map<UUID, LedgerTransaction> activeHolds = new ConcurrentHashMap<>();

    private final AtomicReference<String> latestBlockHash = new AtomicReference<>(
        "0000000000000000000000000000000000000000000000000000000000000000"
    );

    /**
     * Registers a new account in the ledger.
     */
    public Account createAccount(
        String accountNumber,
        String currency,
        AccountType type,
        boolean allowNegativeBalance
    ) {
        UUID id = UUID.randomUUID();
        Account account = new Account(id, accountNumber, currency, type, allowNegativeBalance);
        accounts.put(id, account);
        accountLocks.put(id, new ReentrantLock());
        return account;
    }

    /**
     * Registers an account with an explicit UUID.
     */
    public Account createAccount(
        UUID id,
        String accountNumber,
        String currency,
        AccountType type,
        boolean allowNegativeBalance
    ) {
        Account account = new Account(id, accountNumber, currency, type, allowNegativeBalance);
        accounts.put(id, account);
        accountLocks.put(id, new ReentrantLock());
        return account;
    }

    public Account getAccount(UUID id) {
        Account account = accounts.get(id);
        if (account == null) {
            throw new AccountNotFoundException(id);
        }
        return account;
    }

    public LedgerTransaction getTransaction(UUID id) {
        return transactions.get(id);
    }

    public LedgerTransaction getTransactionByIdempotencyKey(String idempotencyKey) {
        return idempotencyRegistry.get(idempotencyKey);
    }

    public Map<UUID, LedgerTransaction> getActiveHolds() {
        return Collections.unmodifiableMap(activeHolds);
    }

    /**
     * Executes a direct single-phase transfer from source to destination account.
     */
    public LedgerTransaction transfer(
        String idempotencyKey,
        String description,
        UUID sourceAccountId,
        UUID destinationAccountId,
        long amount
    ) {
        // Source pays (CREDIT outflow), Destination receives (DEBIT inflow)
        UUID txId = UUID.randomUUID();
        List<Posting> postings = List.of(
            new Posting(UUID.randomUUID(), txId, sourceAccountId, amount, Direction.CREDIT, 0),
            new Posting(UUID.randomUUID(), txId, destinationAccountId, amount, Direction.DEBIT, 1)
        );

        return postTransaction(idempotencyKey, description, postings, txId);
    }

    /**
     * Executes an arbitrary batch of balanced postings atomically.
     */
    public LedgerTransaction postTransaction(
        String idempotencyKey,
        String description,
        List<Posting> postings
    ) {
        return postTransaction(idempotencyKey, description, postings, UUID.randomUUID());
    }

    private LedgerTransaction postTransaction(
        String idempotencyKey,
        String description,
        List<Posting> postings,
        UUID transactionId
    ) {
        // 1. Check idempotency cache prior to acquiring locks
        LedgerTransaction existing = idempotencyRegistry.get(idempotencyKey);
        if (existing != null) {
            verifyIdempotencyMatch(existing, description, postings);
            return existing;
        }

        // 2. Deterministic lock ordering: sort distinct account IDs
        Set<UUID> accountIds = postings.stream().map(Posting::accountId).collect(Collectors.toSet());
        List<ReentrantLock> acquiredLocks = acquireLocksInOrder(accountIds);

        try {
            // Double-checked locking for idempotency
            existing = idempotencyRegistry.get(idempotencyKey);
            if (existing != null) {
                verifyIdempotencyMatch(existing, description, postings);
                return existing;
            }

            // 3. Validate double-entry invariant & currency uniformity
            LedgerValidator.validateTransactionStructure(postings, accounts);

            // 4. Validate sufficient funds on all legs
            for (Posting posting : postings) {
                Account account = accounts.get(posting.accountId());
                LedgerValidator.validateSufficientFunds(posting, account);
            }

            // 5. Apply postings atomically to in-memory account balances
            for (Posting posting : postings) {
                Account account = accounts.get(posting.accountId());
                account.applyPosting(posting.direction(), posting.amount());
            }

            // 6. Compute cryptographic hash linking to previous block
            Instant now = Instant.now();
            String hash = computeTransactionHash(latestBlockHash.get(), transactionId, idempotencyKey, now, postings);
            latestBlockHash.set(hash);

            LedgerTransaction tx = new LedgerTransaction(
                transactionId,
                idempotencyKey,
                description,
                now,
                TransferStatus.POSTED,
                postings,
                hash
            );

            transactions.put(tx.id(), tx);
            idempotencyRegistry.put(idempotencyKey, tx);
            return tx;

        } finally {
            releaseLocksInReverse(acquiredLocks);
        }
    }

    /**
     * Authorizes a two-phase hold, placing funds in pending status without settling.
     */
    public LedgerTransaction authorizeHold(
        String idempotencyKey,
        String description,
        UUID sourceAccountId,
        UUID destinationAccountId,
        long amount
    ) {
        // Source holds pending payment (CREDIT hold), Destination holds pending receipt (DEBIT hold)
        UUID txId = UUID.randomUUID();
        List<Posting> postings = List.of(
            new Posting(UUID.randomUUID(), txId, sourceAccountId, amount, Direction.CREDIT, 0),
            new Posting(UUID.randomUUID(), txId, destinationAccountId, amount, Direction.DEBIT, 1)
        );

        return authorizeHold(idempotencyKey, description, postings, txId);
    }

    public LedgerTransaction authorizeHold(
        String idempotencyKey,
        String description,
        List<Posting> postings,
        UUID transactionId
    ) {
        LedgerTransaction existing = idempotencyRegistry.get(idempotencyKey);
        if (existing != null) {
            verifyIdempotencyMatch(existing, description, postings);
            return existing;
        }

        Set<UUID> accountIds = postings.stream().map(Posting::accountId).collect(Collectors.toSet());
        List<ReentrantLock> acquiredLocks = acquireLocksInOrder(accountIds);

        try {
            existing = idempotencyRegistry.get(idempotencyKey);
            if (existing != null) {
                verifyIdempotencyMatch(existing, description, postings);
                return existing;
            }

            LedgerValidator.validateTransactionStructure(postings, accounts);

            // Verify hold does not violate available balance limits
            for (Posting posting : postings) {
                Account account = accounts.get(posting.accountId());
                LedgerValidator.validateHoldSufficientFunds(posting.direction(), posting.amount(), account);
            }

            // Reserve pending amounts
            for (Posting posting : postings) {
                Account account = accounts.get(posting.accountId());
                account.applyPendingHold(posting.direction(), posting.amount());
            }

            Instant now = Instant.now();
            String hash = computeTransactionHash(latestBlockHash.get(), transactionId, idempotencyKey, now, postings);
            latestBlockHash.set(hash);

            LedgerTransaction holdTx = new LedgerTransaction(
                transactionId,
                idempotencyKey,
                description,
                now,
                TransferStatus.PENDING,
                postings,
                hash
            );

            transactions.put(holdTx.id(), holdTx);
            activeHolds.put(holdTx.id(), holdTx);
            idempotencyRegistry.put(idempotencyKey, holdTx);
            return holdTx;

        } finally {
            releaseLocksInReverse(acquiredLocks);
        }
    }

    /**
     * Settles a pending hold, moving funds from pending to posted atomically.
     */
    public LedgerTransaction settleHold(UUID holdTransactionId) {
        LedgerTransaction holdTx = activeHolds.get(holdTransactionId);
        if (holdTx == null) {
            throw new LedgerException("Hold transaction not found or already settled/voided: " + holdTransactionId);
        }

        Set<UUID> accountIds = holdTx.postings().stream().map(Posting::accountId).collect(Collectors.toSet());
        List<ReentrantLock> acquiredLocks = acquireLocksInOrder(accountIds);

        try {
            LedgerTransaction currentHold = activeHolds.get(holdTransactionId);
            if (currentHold == null || currentHold.status() != TransferStatus.PENDING) {
                throw new LedgerException("Hold transaction is no longer in PENDING status: " + holdTransactionId);
            }

            for (Posting posting : currentHold.postings()) {
                Account account = accounts.get(posting.accountId());
                account.settlePendingHold(posting.direction(), posting.amount());
            }

            Instant now = Instant.now();
            String hash = computeTransactionHash(latestBlockHash.get(), holdTransactionId, currentHold.idempotencyKey() + ":settled", now, currentHold.postings());
            latestBlockHash.set(hash);

            LedgerTransaction settledTx = new LedgerTransaction(
                holdTransactionId,
                currentHold.idempotencyKey(),
                currentHold.description() + " [SETTLED]",
                now,
                TransferStatus.POSTED,
                currentHold.postings(),
                hash
            );

            activeHolds.remove(holdTransactionId);
            transactions.put(holdTransactionId, settledTx);
            idempotencyRegistry.put(currentHold.idempotencyKey(), settledTx);
            return settledTx;

        } finally {
            releaseLocksInReverse(acquiredLocks);
        }
    }

    /**
     * Voids an active hold, releasing all reserved funds back to available balance.
     */
    public LedgerTransaction voidHold(UUID holdTransactionId) {
        LedgerTransaction holdTx = activeHolds.get(holdTransactionId);
        if (holdTx == null) {
            throw new LedgerException("Hold transaction not found or already settled/voided: " + holdTransactionId);
        }

        Set<UUID> accountIds = holdTx.postings().stream().map(Posting::accountId).collect(Collectors.toSet());
        List<ReentrantLock> acquiredLocks = acquireLocksInOrder(accountIds);

        try {
            LedgerTransaction currentHold = activeHolds.get(holdTransactionId);
            if (currentHold == null || currentHold.status() != TransferStatus.PENDING) {
                throw new LedgerException("Hold transaction is no longer in PENDING status: " + holdTransactionId);
            }

            for (Posting posting : currentHold.postings()) {
                Account account = accounts.get(posting.accountId());
                account.releasePendingHold(posting.direction(), posting.amount());
            }

            Instant now = Instant.now();
            String hash = computeTransactionHash(latestBlockHash.get(), holdTransactionId, currentHold.idempotencyKey() + ":voided", now, currentHold.postings());
            latestBlockHash.set(hash);

            LedgerTransaction voidedTx = new LedgerTransaction(
                holdTransactionId,
                currentHold.idempotencyKey(),
                currentHold.description() + " [VOIDED]",
                now,
                TransferStatus.VOIDED,
                currentHold.postings(),
                hash
            );

            activeHolds.remove(holdTransactionId);
            transactions.put(holdTransactionId, voidedTx);
            idempotencyRegistry.put(currentHold.idempotencyKey(), voidedTx);
            return voidedTx;

        } finally {
            releaseLocksInReverse(acquiredLocks);
        }
    }

    // --- Private Helper Methods ---

    private ReentrantLock getAccountLock(UUID accountId) {
        return accountLocks.computeIfAbsent(accountId, k -> new ReentrantLock());
    }

    private List<ReentrantLock> acquireLocksInOrder(Set<UUID> accountIds) {
        List<UUID> sortedIds = accountIds.stream()
            .sorted(Comparator.naturalOrder())
            .toList();

        List<ReentrantLock> acquired = new ArrayList<>(sortedIds.size());
        for (UUID id : sortedIds) {
            ReentrantLock lock = getAccountLock(id);
            lock.lock();
            acquired.add(lock);
        }
        return acquired;
    }

    private void releaseLocksInReverse(List<ReentrantLock> locks) {
        for (int i = locks.size() - 1; i >= 0; i--) {
            locks.get(i).unlock();
        }
    }

    private void verifyIdempotencyMatch(
        LedgerTransaction existing,
        String description,
        List<Posting> postings
    ) {
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

        for (int i = 0; i < postings.size(); i++) {
            Posting exp = existing.postings().get(i);
            Posting act = postings.get(i);
            if (!exp.accountId().equals(act.accountId()) ||
                exp.direction() != act.direction() ||
                exp.amount() != act.amount()) {
                throw new IdempotencyConflictException(
                    existing.idempotencyKey(),
                    String.format("Posting leg %d mismatch: expected account %s, %s %d; got account %s, %s %d",
                        i, exp.accountId(), exp.direction(), exp.amount(), act.accountId(), act.direction(), act.amount())
                );
            }
        }
    }

    private String computeTransactionHash(
        String prevHash,
        UUID txId,
        String idempotencyKey,
        Instant timestamp,
        List<Posting> postings
    ) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            StringBuilder sb = new StringBuilder();
            sb.append(prevHash).append(':')
              .append(txId).append(':')
              .append(idempotencyKey).append(':')
              .append(timestamp.toEpochMilli());

            for (Posting p : postings) {
                sb.append(':').append(p.accountId())
                  .append(',').append(p.direction())
                  .append(',').append(p.amount());
            }

            byte[] hashBytes = digest.digest(sb.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hashBytes.length * 2);
            for (byte b : hashBytes) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm not available", e);
        }
    }
}
