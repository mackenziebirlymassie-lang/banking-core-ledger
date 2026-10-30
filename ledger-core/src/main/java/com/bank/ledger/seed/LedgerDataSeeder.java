package com.bank.ledger.seed;

import com.bank.ledger.domain.Account;
import com.bank.ledger.domain.AccountType;
import com.bank.ledger.domain.Direction;
import com.bank.ledger.domain.LedgerTransaction;
import com.bank.ledger.domain.Posting;
import com.bank.ledger.repository.AccountRepository;
import com.bank.ledger.repository.PostgresLedgerEngine;
import com.bank.ledger.wal.AuditVerificationReport;
import com.bank.ledger.wal.AuditVerifierService;
import com.bank.ledger.wal.BinaryWalWriter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.util.List;
import java.util.UUID;

/**
 * Realistic Institutional Seed Data Initializer.
 * Creates an authentic institutional Chart of Accounts and executes 25 historical transactions,
 * establishing an immediate verified cryptographic hash chain on boot.
 */
@Component
public class LedgerDataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(LedgerDataSeeder.class);

    private final PostgresLedgerEngine engine;
    private final AccountRepository accountRepository;
    private final DataSource dataSource;
    private final BinaryWalWriter walWriter;
    private final AuditVerifierService verifierService;

    public LedgerDataSeeder(
        PostgresLedgerEngine engine,
        AccountRepository accountRepository,
        DataSource dataSource,
        BinaryWalWriter walWriter,
        AuditVerifierService verifierService
    ) {
        this.engine = engine;
        this.accountRepository = accountRepository;
        this.dataSource = dataSource;
        this.walWriter = walWriter;
        this.verifierService = verifierService;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (accountRepository.count() > 0) {
            log.info("[LedgerDataSeeder] Ledger accounts already exist. Skipping seed.");
            return;
        }

        log.info("[LedgerDataSeeder] Initializing Chart of Accounts and 25 seed transactions...");

        // 1. Chart of Accounts
        Account treasury = engine.createAccount("TREASURY-USD-001", "USD", AccountType.ASSET, true);
        Account reserve = engine.createAccount("OPERATING-RESERVE-USD", "USD", AccountType.ASSET, false);
        Account alice = engine.createAccount("CUSTOMER-WALLET-ALICE", "USD", AccountType.LIABILITY, false);
        Account bob = engine.createAccount("CUSTOMER-WALLET-BOB", "USD", AccountType.LIABILITY, false);
        Account stripe = engine.createAccount("MERCHANT-SETTLEMENT-STRIPE", "USD", AccountType.LIABILITY, false);
        Account escrow = engine.createAccount("CARD-HOLD-ESCROW-USD", "USD", AccountType.LIABILITY, false);
        Account feeRevenue = engine.createAccount("FEE-REVENUE-USD", "USD", AccountType.REVENUE, false);

        // Tx 1: Treasury funding Operating Reserve ($1,000,000.00)
        postBalanced(
            "seed-tx-01", "Treasury capital injection to Operating Reserve",
            treasury.getId(), 100_000_000L, Direction.CREDIT,
            reserve.getId(), 100_000_000L, Direction.DEBIT
        );

        // Tx 2: Customer Deposit Alice ($50,000.00)
        postBalanced(
            "seed-tx-02", "Initial customer deposit Alice",
            treasury.getId(), 5_000_000L, Direction.DEBIT,
            alice.getId(), 5_000_000L, Direction.CREDIT
        );

        // Tx 3: Customer Deposit Bob ($50,000.00)
        postBalanced(
            "seed-tx-03", "Initial customer deposit Bob",
            treasury.getId(), 5_000_000L, Direction.DEBIT,
            bob.getId(), 5_000_000L, Direction.CREDIT
        );

        // Tx 4: Merchant Settlement Float Stripe ($100,000.00)
        postBalanced(
            "seed-tx-04", "Merchant settlement liquidity float Stripe",
            treasury.getId(), 10_000_000L, Direction.DEBIT,
            stripe.getId(), 10_000_000L, Direction.CREDIT
        );

        // Tx 5 - 14: Merchant Purchases with Platform Fee Splits (3-leg transactions)
        long[][] purchases = {
            {15_000L, 14_550L, 450L},
            {20_000L, 19_400L, 600L},
            {5_000L, 4_850L, 150L},
            {7_500L, 7_275L, 225L},
            {30_000L, 29_100L, 900L},
            {12_000L, 11_640L, 360L},
            {8_500L, 8_245L, 255L},
            {4_500L, 4_365L, 135L},
            {22_000L, 21_340L, 660L},
            {9_500L, 9_215L, 285L}
        };

        for (int i = 0; i < purchases.length; i++) {
            int txNum = 5 + i;
            UUID buyerId = (i % 2 == 0) ? alice.getId() : bob.getId();
            String buyerName = (i % 2 == 0) ? "Alice" : "Bob";
            long total = purchases[i][0];
            long merchantShare = purchases[i][1];
            long feeShare = purchases[i][2];

            UUID txId = UUID.randomUUID();
            List<Posting> legs = List.of(
                new Posting(UUID.randomUUID(), txId, buyerId, total, Direction.DEBIT, 0),
                new Posting(UUID.randomUUID(), txId, stripe.getId(), merchantShare, Direction.CREDIT, 1),
                new Posting(UUID.randomUUID(), txId, feeRevenue.getId(), feeShare, Direction.CREDIT, 2)
            );

            engine.postTransaction(
                "seed-tx-" + String.format("%02d", txNum),
                String.format("Card Checkout %s -> Stripe (Fee: $%.2f)", buyerName, feeShare / 100.0),
                legs,
                txId
            );
        }

        // Tx 15 - 18: Peer-to-Peer Transfers Alice <-> Bob
        postBalanced("seed-tx-15", "P2P transfer Alice -> Bob ($50.00)", alice.getId(), 5_000L, Direction.DEBIT, bob.getId(), 5_000L, Direction.CREDIT);
        postBalanced("seed-tx-16", "P2P transfer Bob -> Alice ($25.00)", bob.getId(), 2_500L, Direction.DEBIT, alice.getId(), 2_500L, Direction.CREDIT);
        postBalanced("seed-tx-17", "P2P transfer Alice -> Bob ($100.00)", alice.getId(), 10_000L, Direction.DEBIT, bob.getId(), 10_000L, Direction.CREDIT);
        postBalanced("seed-tx-18", "P2P transfer Bob -> Alice ($40.00)", bob.getId(), 4_000L, Direction.DEBIT, alice.getId(), 4_000L, Direction.CREDIT);

        // Tx 19: Card Hold Alice ($65.00)
        LedgerTransaction hold1 = engine.authorizeHold("seed-tx-19", "Uber Ride Pre-Authorization", alice.getId(), escrow.getId(), 6_500L);

        // Tx 20: Card Hold Bob ($120.00)
        LedgerTransaction hold2 = engine.authorizeHold("seed-tx-20", "Hotel Security Deposit Hold", bob.getId(), escrow.getId(), 12_000L);

        // Tx 21: Card Hold Alice ($45.00)
        LedgerTransaction hold3 = engine.authorizeHold("seed-tx-21", "Gas Pump Pre-Authorization", alice.getId(), escrow.getId(), 4_500L);

        // Tx 22: Settle Hold 1
        engine.settleHold(hold1.id());

        // Tx 23: Settle Hold 2
        engine.settleHold(hold2.id());

        // Tx 24: Void Hold 3
        engine.voidHold(hold3.id());

        // Tx 25: Operating Reserve to Treasury Liquidity Sweep ($100.00)
        postBalanced(
            "seed-tx-25", "Operating Reserve liquidity sweep to Treasury",
            reserve.getId(), 10_000L, Direction.CREDIT,
            treasury.getId(), 10_000L, Direction.DEBIT
        );

        // Verify cryptographic hash chain across all 25 transactions immediately
        AuditVerificationReport report = verifierService.verifyDatabase(dataSource, walWriter);
        if (!report.valid()) {
            throw new IllegalStateException("Seed verification failed: " + report.failureReason());
        }

        log.info("[LedgerDataSeeder] Successfully seeded 7 accounts and 25 historical transactions.");
        log.info("[LedgerDataSeeder] Cryptographic Chain Verified: TRUE (Scanned: {}, Merkle Root: {})",
            report.totalTransactionsScanned(), report.calculatedMerkleRoot());
    }

    private void postBalanced(
        String idempotencyKey,
        String description,
        UUID acc1, long amt1, Direction dir1,
        UUID acc2, long amt2, Direction dir2
    ) {
        UUID txId = UUID.randomUUID();
        List<Posting> postings = List.of(
            new Posting(UUID.randomUUID(), txId, acc1, amt1, dir1, 0),
            new Posting(UUID.randomUUID(), txId, acc2, amt2, dir2, 1)
        );
        engine.postTransaction(idempotencyKey, description, postings, txId);
    }
}
