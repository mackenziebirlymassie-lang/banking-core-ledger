package com.bank.ledger.repository;

import com.bank.ledger.crypto.HashChainService;
import com.bank.ledger.domain.Account;
import com.bank.ledger.domain.AccountType;
import com.bank.ledger.domain.LedgerTransaction;
import com.bank.ledger.domain.TransferStatus;
import com.bank.ledger.wal.AuditVerificationReport;
import com.bank.ledger.wal.AuditVerifierService;
import com.bank.ledger.wal.BinaryWalWriter;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PostgresLedgerPersistenceTest {

    private HikariDataSource dataSource;
    private NamedParameterJdbcTemplate jdbcTemplate;
    private AccountRepository accountRepository;
    private LedgerTransactionRepository transactionRepository;
    private BinaryWalWriter walWriter;
    private PostgresLedgerEngine engine;
    private AuditVerifierService verifierService;

    @BeforeEach
    void setUp(@TempDir Path tempDir) throws Exception {
        // Initialize high-performance HikariCP connection pool with H2 in PostgreSQL mode
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl("jdbc:h2:mem:ledger_test_" + UUID.randomUUID() + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH");
        config.setUsername("sa");
        config.setPassword("");
        config.setMaximumPoolSize(20);
        dataSource = new HikariDataSource(config);

        // Execute schema initialization
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement();
             InputStream in = getClass().getResourceAsStream("/db/test-schema-h2.sql")) {
            assertThat(in).isNotNull();
            String ddl = new String(in.readAllBytes(), StandardCharsets.UTF_8);
            for (String sql : ddl.split(";")) {
                if (!sql.trim().isEmpty()) {
                    stmt.execute(sql);
                }
            }
        }

        jdbcTemplate = new NamedParameterJdbcTemplate(dataSource);
        accountRepository = new AccountRepository(jdbcTemplate);
        transactionRepository = new LedgerTransactionRepository(jdbcTemplate);

        Path walPath = tempDir.resolve("test-ledger.wal");
        walWriter = new BinaryWalWriter(walPath);

        DataSourceTransactionManager txManager = new DataSourceTransactionManager(dataSource);
        engine = new PostgresLedgerEngine(accountRepository, transactionRepository, walWriter, txManager);
        verifierService = new AuditVerifierService();
    }

    @AfterEach
    void tearDown() throws Exception {
        if (walWriter != null) {
            walWriter.close();
        }
        if (dataSource != null) {
            dataSource.close();
        }
    }

    @Test
    @DisplayName("End-to-End: 100 sequential and concurrent transfers with database persistence and lock ordering")
    void shouldPersist100TransfersWithDeterministicLocking() throws Exception {
        Account vault = engine.createAccount("VAULT", "USD", AccountType.LIABILITY, true);
        Account accA = engine.createAccount("ACC-A", "USD", AccountType.ASSET, false);
        Account accB = engine.createAccount("ACC-B", "USD", AccountType.ASSET, false);

        // Fund initial balances: $50,000.00 (5,000,000 cents) each
        engine.transfer("fund-a", "Initial funding A", vault.getId(), accA.getId(), 5_000_000L);
        engine.transfer("fund-b", "Initial funding B", vault.getId(), accB.getId(), 5_000_000L);

        int totalTransfers = 100;
        CountDownLatch startLatch = new CountDownLatch(1);
        List<Future<?>> futures = new ArrayList<>();

        try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int i = 0; i < totalTransfers; i++) {
                final int idx = i;
                futures.add(executor.submit(() -> {
                    startLatch.await();
                    // Alternating transfer directions to test bidirectional row-locking
                    if (idx % 2 == 0) {
                        engine.transfer(
                            "tx-cross-" + idx,
                            "Cross transfer A -> B " + idx,
                            accA.getId(),
                            accB.getId(),
                            100L
                        );
                    } else {
                        engine.transfer(
                            "tx-cross-" + idx,
                            "Cross transfer B -> A " + idx,
                            accB.getId(),
                            accA.getId(),
                            100L
                        );
                    }
                    return null;
                }));
            }

            startLatch.countDown();

            for (Future<?> f : futures) {
                f.get(15, TimeUnit.SECONDS);
            }
        }

        // Verify database balances: net transfer = 0 (50 * $1.00 each way)
        Account finalA = engine.getAccount(accA.getId()).orElseThrow();
        Account finalB = engine.getAccount(accB.getId()).orElseThrow();

        assertThat(finalA.getAvailableBalance()).isEqualTo(5_000_000L);
        assertThat(finalB.getAvailableBalance()).isEqualTo(5_000_000L);

        // Verify full cryptographic audit chain across all 102 transactions (2 fund + 100 transfers)
        AuditVerificationReport report = verifierService.verifyDatabase(dataSource, walWriter);
        assertThat(report.valid()).withFailMessage("Audit verification failed: %s", report.failureReason()).isTrue();
        assertThat(report.totalTransactionsScanned()).isEqualTo(102);
        assertThat(report.calculatedMerkleRoot()).isEqualTo(walWriter.getMerkleRoot());
    }

    @Test
    @DisplayName("Audit Verifier: Detects simulated tampering on transaction description or amount")
    void shouldDetectSimulatedDatabaseTampering() throws Exception {
        Account vault = engine.createAccount("VAULT-SEC", "USD", AccountType.LIABILITY, true);
        Account customer = engine.createAccount("CUST-SEC", "USD", AccountType.ASSET, false);

        engine.transfer("fund-sec-1", "Valid payment 1", vault.getId(), customer.getId(), 1000L);
        LedgerTransaction tx2 = engine.transfer("fund-sec-2", "Valid payment 2", vault.getId(), customer.getId(), 2000L);
        engine.transfer("fund-sec-3", "Valid payment 3", vault.getId(), customer.getId(), 3000L);

        // Pre-tampering verification must succeed
        AuditVerificationReport cleanReport = verifierService.verifyDatabase(dataSource, walWriter);
        assertThat(cleanReport.valid()).withFailMessage("Audit verification failed: %s", cleanReport.failureReason()).isTrue();
        assertThat(cleanReport.totalTransactionsScanned()).isEqualTo(3);

        // Simulate rogue database admin tampering: modifying transaction 2 payload hash
        jdbcTemplate.update(
            "UPDATE ledger_transactions SET payload_hash = :fakeHash WHERE id = :id",
            Map.of("fakeHash", "deadbeef".repeat(8), "id", tx2.id())
        );

        // Audit verifier must catch the exact tampered transaction ID
        AuditVerificationReport tamperedReport = verifierService.verifyDatabase(dataSource, walWriter);
        assertThat(tamperedReport.valid()).isFalse();
        assertThat(tamperedReport.corruptedTransactionId()).isEqualTo(tx2.id());
        assertThat(tamperedReport.corruptedSequenceNum()).isEqualTo(2L);
        assertThat(tamperedReport.failureReason()).contains("tampering detected");
    }

    @Test
    @DisplayName("Database Immutability: Rejects UPDATE or DELETE on postings table via database trigger")
    void shouldRejectPostingsUpdateOrDeleteViaTrigger() {
        Account vault = engine.createAccount("VAULT-IMM", "USD", AccountType.LIABILITY, true);
        Account customer = engine.createAccount("CUST-IMM", "USD", AccountType.ASSET, false);

        LedgerTransaction tx = engine.transfer("tx-imm-1", "Immutable payment", vault.getId(), customer.getId(), 5000L);
        UUID postingId = tx.postings().get(0).id();

        // Attempt direct SQL DELETE
        assertThatThrownBy(() ->
            jdbcTemplate.update("DELETE FROM postings WHERE id = :id", Map.of("id", postingId))
        )
        .hasMessageContaining("Immutability violation");

        // Attempt direct SQL UPDATE
        assertThatThrownBy(() ->
            jdbcTemplate.update("UPDATE postings SET amount = 9999 WHERE id = :id", Map.of("id", postingId))
        )
        .hasMessageContaining("Immutability violation");
    }

    @Test
    @DisplayName("Database Invariants: Rejects negative available balance via CHECK constraint")
    void shouldEnforceAccountAvailableBalanceCheckConstraint() {
        UUID accId = UUID.randomUUID();

        // Inserting an asset account with negative available balance directly via SQL fails constraint
        assertThatThrownBy(() ->
            jdbcTemplate.update("""
                INSERT INTO accounts (
                    id, account_number, currency, type, allow_negative_balance,
                    posted_debits, posted_credits, pending_debits, pending_credits, version
                ) VALUES (
                    :id, 'OVERDRAFT-FAIL', 'USD', 'ASSET', FALSE,
                    100, 500, 0, 0, 0
                )
                """, Map.of("id", accId))
        )
        .hasMessageContaining("chk_account_available_balance");
    }
}
