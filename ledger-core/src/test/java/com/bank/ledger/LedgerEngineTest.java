package com.bank.ledger;

import com.bank.ledger.domain.Account;
import com.bank.ledger.domain.AccountType;
import com.bank.ledger.domain.Direction;
import com.bank.ledger.domain.LedgerTransaction;
import com.bank.ledger.domain.Posting;
import com.bank.ledger.domain.TransferStatus;
import com.bank.ledger.engine.LedgerEngine;
import com.bank.ledger.exception.IdempotencyConflictException;
import com.bank.ledger.exception.InsufficientFundsException;
import com.bank.ledger.exception.UnbalancedTransactionException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class LedgerEngineTest {

    private LedgerEngine engine;

    @BeforeEach
    void setUp() {
        engine = new LedgerEngine();
    }

    @Nested
    @DisplayName("Double-Entry Invariant & Accounting Math")
    class DoubleEntryInvariantTests {

        @Test
        @DisplayName("Rejects transaction when sum(Debits) != sum(Credits)")
        void shouldRejectUnbalancedPostings() {
            Account acc1 = engine.createAccount("ACC-001", "USD", AccountType.ASSET, false);
            Account acc2 = engine.createAccount("ACC-002", "USD", AccountType.ASSET, false);

            UUID txId = UUID.randomUUID();
            List<Posting> unbalanced = List.of(
                new Posting(UUID.randomUUID(), txId, acc1.getId(), 5000L, Direction.CREDIT, 0),
                new Posting(UUID.randomUUID(), txId, acc2.getId(), 4000L, Direction.DEBIT, 1) // 1000 discrepancy
            );

            assertThatThrownBy(() -> engine.postTransaction("tx-unbalanced", "Unbalanced transfer", unbalanced))
                .isInstanceOf(UnbalancedTransactionException.class)
                .hasMessageContaining("discrepancy (1000)");

            // Verify balances remain strictly unchanged
            assertThat(acc1.getPostedBalance()).isEqualTo(0L);
            assertThat(acc2.getPostedBalance()).isEqualTo(0L);
        }

        @Test
        @DisplayName("Rejects transaction with fewer than 2 postings")
        void shouldRejectFewerThanTwoPostings() {
            Account acc1 = engine.createAccount("ACC-001", "USD", AccountType.ASSET, false);
            UUID txId = UUID.randomUUID();
            List<Posting> singlePosting = List.of(
                new Posting(UUID.randomUUID(), txId, acc1.getId(), 1000L, Direction.DEBIT, 0)
            );

            assertThatThrownBy(() -> engine.postTransaction("tx-single", "Single leg", singlePosting))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("at least 2 postings");
        }

        @Test
        @DisplayName("Rejects overdraft when allowNegativeBalance is false")
        void shouldRejectOverdraftWhenNegativeNotAllowed() {
            Account vault = engine.createAccount("VAULT", "USD", AccountType.LIABILITY, true);
            Account customer = engine.createAccount("CUST-100", "USD", AccountType.ASSET, false);

            // Fund customer with $50.00 (5,000 cents)
            engine.transfer("fund-01", "Initial deposit", vault.getId(), customer.getId(), 5000L);
            assertThat(customer.getAvailableBalance()).isEqualTo(5000L);

            // Attempt to transfer $50.01 (5,001 cents)
            assertThatThrownBy(() ->
                engine.transfer("overdraft-attempt", "Overdraft", customer.getId(), vault.getId(), 5001L)
            )
            .isInstanceOf(InsufficientFundsException.class)
            .hasMessageContaining("insufficient funds");

            // Assert balance is unchanged
            assertThat(customer.getAvailableBalance()).isEqualTo(5000L);
        }
    }

    @Nested
    @DisplayName("Idempotency Defense")
    class IdempotencyTests {

        @Test
        @DisplayName("Idempotent retry returns exact same transaction without duplicate posting")
        void shouldReturnSameTransactionOnIdenticalRetry() {
            Account vault = engine.createAccount("VAULT", "USD", AccountType.LIABILITY, true);
            Account customer = engine.createAccount("CUST-101", "USD", AccountType.ASSET, false);

            LedgerTransaction first = engine.transfer("idemp-01", "Payment 1", vault.getId(), customer.getId(), 2500L);
            LedgerTransaction second = engine.transfer("idemp-01", "Payment 1", vault.getId(), customer.getId(), 2500L);

            assertThat(first.id()).isEqualTo(second.id());
            assertThat(first.hash()).isEqualTo(second.hash());
            assertThat(first.postedAt()).isEqualTo(second.postedAt());

            // Balance must be credited only ONCE ($25.00, not $50.00)
            assertThat(customer.getPostedBalance()).isEqualTo(2500L);
        }

        @Test
        @DisplayName("Idempotency conflict throws exception when parameters differ")
        void shouldThrowConflictWhenParametersDiffer() {
            Account vault = engine.createAccount("VAULT", "USD", AccountType.LIABILITY, true);
            Account customer = engine.createAccount("CUST-102", "USD", AccountType.ASSET, false);

            engine.transfer("idemp-conflict-key", "Payment A", vault.getId(), customer.getId(), 1000L);

            // Different description
            assertThatThrownBy(() ->
                engine.transfer("idemp-conflict-key", "Payment B", vault.getId(), customer.getId(), 1000L)
            ).isInstanceOf(IdempotencyConflictException.class);

            // Different amount
            assertThatThrownBy(() ->
                engine.transfer("idemp-conflict-key", "Payment A", vault.getId(), customer.getId(), 2000L)
            ).isInstanceOf(IdempotencyConflictException.class);
        }
    }

    @Nested
    @DisplayName("Two-Phase Transfer Lifecycle (Hold -> Settle / Void)")
    class TwoPhaseTransferTests {

        @Test
        @DisplayName("Full Hold -> Settle lifecycle updates pending then posted accurately")
        void shouldHandleHoldAndSettleLifecycle() {
            Account vault = engine.createAccount("VAULT", "USD", AccountType.LIABILITY, true);
            Account customer = engine.createAccount("CUST-200", "USD", AccountType.ASSET, false);
            Account merchant = engine.createAccount("MERCH-01", "USD", AccountType.ASSET, false);

            // 1. Initial Deposit: $100.00 (10,000 cents)
            engine.transfer("deposit-200", "Deposit", vault.getId(), customer.getId(), 10000L);
            assertThat(customer.getPostedBalance()).isEqualTo(10000L);
            assertThat(customer.getAvailableBalance()).isEqualTo(10000L);

            // 2. Authorize Hold: $30.00 (3,000 cents)
            LedgerTransaction holdTx = engine.authorizeHold("hold-001", "Hotel Authorization", customer.getId(), merchant.getId(), 3000L);
            assertThat(holdTx.status()).isEqualTo(TransferStatus.PENDING);

            // Customer posted balance is still 10,000, but available balance is reduced to 7,000
            assertThat(customer.getPostedBalance()).isEqualTo(10000L);
            assertThat(customer.getPendingCredits()).isEqualTo(3000L);
            assertThat(customer.getAvailableBalance()).isEqualTo(7000L);

            // Merchant has pending debit of 3,000
            assertThat(merchant.getPendingDebits()).isEqualTo(3000L);
            assertThat(merchant.getPostedBalance()).isEqualTo(0L);

            // 3. Attempting to spend $70.01 fails because available is only 7,000
            assertThatThrownBy(() ->
                engine.transfer("spend-exceed", "Exceeds available", customer.getId(), vault.getId(), 7001L)
            ).isInstanceOf(InsufficientFundsException.class);

            // 4. Settle Hold
            LedgerTransaction settledTx = engine.settleHold(holdTx.id());
            assertThat(settledTx.status()).isEqualTo(TransferStatus.POSTED);

            // Verification after settlement:
            // Customer pending cleared, posted debits/credits settled
            assertThat(customer.getPendingCredits()).isEqualTo(0L);
            assertThat(customer.getPostedCredits()).isEqualTo(3000L);
            assertThat(customer.getPostedBalance()).isEqualTo(7000L);
            assertThat(customer.getAvailableBalance()).isEqualTo(7000L);

            // Merchant pending cleared, posted debits settled
            assertThat(merchant.getPendingDebits()).isEqualTo(0L);
            assertThat(merchant.getPostedDebits()).isEqualTo(3000L);
            assertThat(merchant.getPostedBalance()).isEqualTo(3000L);
            assertThat(merchant.getAvailableBalance()).isEqualTo(3000L);
        }

        @Test
        @DisplayName("Full Hold -> Void lifecycle releases reserved funds back to available balance")
        void shouldHandleHoldAndVoidLifecycle() {
            Account vault = engine.createAccount("VAULT", "USD", AccountType.LIABILITY, true);
            Account customer = engine.createAccount("CUST-201", "USD", AccountType.ASSET, false);
            Account merchant = engine.createAccount("MERCH-02", "USD", AccountType.ASSET, false);

            engine.transfer("deposit-201", "Deposit", vault.getId(), customer.getId(), 10000L);

            // Place hold for $40.00
            LedgerTransaction holdTx = engine.authorizeHold("hold-002", "Rental Hold", customer.getId(), merchant.getId(), 4000L);
            assertThat(customer.getAvailableBalance()).isEqualTo(6000L);

            // Void hold
            LedgerTransaction voidedTx = engine.voidHold(holdTx.id());
            assertThat(voidedTx.status()).isEqualTo(TransferStatus.VOIDED);

            // Available balance restored to full 10,000; posted balance never changed
            assertThat(customer.getPendingCredits()).isEqualTo(0L);
            assertThat(customer.getPostedCredits()).isEqualTo(0L);
            assertThat(customer.getPostedBalance()).isEqualTo(10000L);
            assertThat(customer.getAvailableBalance()).isEqualTo(10000L);

            // Merchant pending cleared
            assertThat(merchant.getPendingDebits()).isEqualTo(0L);
            assertThat(merchant.getPostedBalance()).isEqualTo(0L);
        }
    }

    @Nested
    @DisplayName("Virtual Thread Concurrency & Deadlock Stress Tests")
    class ConcurrencyStressTests {

        @Test
        @DisplayName("Deadlock Torture Test: 200 concurrent tasks crossing transfers between Account 1 & 2")
        void shouldEliminateDeadlocksUnderBidirectionalStress() throws Exception {
            Account vault = engine.createAccount("VAULT", "USD", AccountType.LIABILITY, true);
            Account acc1 = engine.createAccount("ACC-CONCUR-1", "USD", AccountType.ASSET, false);
            Account acc2 = engine.createAccount("ACC-CONCUR-2", "USD", AccountType.ASSET, false);

            // Initial balance: $100,000.00 (10,000,000 cents) each
            long initialBalance = 10_000_000L;
            engine.transfer("fund-c1", "Fund 1", vault.getId(), acc1.getId(), initialBalance);
            engine.transfer("fund-c2", "Fund 2", vault.getId(), acc2.getId(), initialBalance);

            int groupSize = 500;
            long transferAmount = 100L; // $1.00 per transfer
            CountDownLatch startLatch = new CountDownLatch(1);
            List<Future<?>> futures = new ArrayList<>();

            try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
                // Thread Group A: acc1 -> acc2 (500 transfers)
                for (int i = 0; i < groupSize; i++) {
                    final int index = i;
                    futures.add(executor.submit(() -> {
                        startLatch.await();
                        engine.transfer(
                            "group-a-" + index,
                            "Transfer A -> B " + index,
                            acc1.getId(),
                            acc2.getId(),
                            transferAmount
                        );
                        return null;
                    }));
                }

                // Thread Group B: acc2 -> acc1 (500 transfers)
                for (int i = 0; i < groupSize; i++) {
                    final int index = i;
                    futures.add(executor.submit(() -> {
                        startLatch.await();
                        engine.transfer(
                            "group-b-" + index,
                            "Transfer B -> A " + index,
                            acc2.getId(),
                            acc1.getId(),
                            transferAmount
                        );
                        return null;
                    }));
                }

                // Release all virtual threads at once
                startLatch.countDown();

                // Wait for all 1,000 tasks to finish without deadlocking
                for (Future<?> f : futures) {
                    f.get(10, TimeUnit.SECONDS);
                }
            }

            // Both accounts must have exact same initial balance (net transfer = 0)
            assertThat(acc1.getPostedBalance()).isEqualTo(initialBalance);
            assertThat(acc2.getPostedBalance()).isEqualTo(initialBalance);
            assertThat(acc1.getAvailableBalance()).isEqualTo(initialBalance);
            assertThat(acc2.getAvailableBalance()).isEqualTo(initialBalance);
        }

        @Test
        @DisplayName("Race Condition Drain Test: 50 concurrent threads race to drain $100.00 via $10.00 transfers")
        void shouldAtomicallyPreventNegativeBalanceUnderConcurrentDrain() throws Exception {
            Account vault = engine.createAccount("VAULT-DRAIN", "USD", AccountType.LIABILITY, true);
            Account source = engine.createAccount("DRAIN-SRC", "USD", AccountType.ASSET, false);
            Account dest = engine.createAccount("DRAIN-DST", "USD", AccountType.ASSET, false);

            // Fund source with exactly $100.00 (10,000 cents)
            engine.transfer("fund-drain", "Fund drain test", vault.getId(), source.getId(), 10_000L);
            assertThat(source.getAvailableBalance()).isEqualTo(10_000L);

            int totalThreads = 50;
            long transferAmount = 1000L; // $10.00 each
            AtomicInteger successCount = new AtomicInteger(0);
            AtomicInteger insufficientFundsCount = new AtomicInteger(0);
            CountDownLatch startLatch = new CountDownLatch(1);
            List<Future<?>> futures = new ArrayList<>();

            try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
                for (int i = 0; i < totalThreads; i++) {
                    final int idx = i;
                    futures.add(executor.submit(() -> {
                        startLatch.await();
                        try {
                            engine.transfer(
                                "drain-tx-" + idx,
                                "Drain attempt " + idx,
                                source.getId(),
                                dest.getId(),
                                transferAmount
                            );
                            successCount.incrementAndGet();
                        } catch (InsufficientFundsException e) {
                            insufficientFundsCount.incrementAndGet();
                        }
                        return null;
                    }));
                }

                startLatch.countDown();

                for (Future<?> f : futures) {
                    f.get(10, TimeUnit.SECONDS);
                }
            }

            // Exactly 10 transfers must succeed (10 * 1,000 = 10,000)
            assertThat(successCount.get()).isEqualTo(10);
            // Exactly 40 transfers must be cleanly rejected
            assertThat(insufficientFundsCount.get()).isEqualTo(40);

            // Final source balance must be exactly 0 cents
            assertThat(source.getAvailableBalance()).isEqualTo(0L);
            assertThat(source.getPostedBalance()).isEqualTo(0L);

            // Destination balance must be exactly 10,000 cents
            assertThat(dest.getAvailableBalance()).isEqualTo(10_000L);
            assertThat(dest.getPostedBalance()).isEqualTo(10_000L);
        }
    }
}
