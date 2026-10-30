package com.bank.ledger.config;

import com.bank.ledger.repository.AccountRepository;
import com.bank.ledger.repository.LedgerTransactionRepository;
import com.bank.ledger.repository.PostgresLedgerEngine;
import com.bank.ledger.service.LedgerStreamService;
import com.bank.ledger.wal.AuditVerifierService;
import com.bank.ledger.wal.BinaryWalWriter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Core Banking Ledger Spring bean configuration.
 */
@Configuration
public class LedgerConfig {

    private static final Logger log = LoggerFactory.getLogger(LedgerConfig.class);

    @Bean
    public AccountRepository accountRepository(NamedParameterJdbcTemplate jdbcTemplate) {
        return new AccountRepository(jdbcTemplate);
    }

    @Bean
    public LedgerTransactionRepository ledgerTransactionRepository(NamedParameterJdbcTemplate jdbcTemplate) {
        return new LedgerTransactionRepository(jdbcTemplate);
    }

    @Bean(destroyMethod = "close")
    public BinaryWalWriter binaryWalWriter(@Value("${ledger.wal.path:data/ledger.wal}") String walPathStr) {
        try {
            Path path = Paths.get(walPathStr);
            if (path.getParent() != null && !Files.exists(path.getParent())) {
                Files.createDirectories(path.getParent());
            }
            return new BinaryWalWriter(path);
        } catch (IOException e) {
            log.error("Could not initialize BinaryWalWriter at {}: {}", walPathStr, e.getMessage());
            throw new IllegalStateException("Failed to open Write-Ahead Log", e);
        }
    }

    @Bean
    public AuditVerifierService auditVerifierService() {
        return new AuditVerifierService();
    }

    @Bean
    public PostgresLedgerEngine postgresLedgerEngine(
        AccountRepository accountRepository,
        LedgerTransactionRepository transactionRepository,
        BinaryWalWriter walWriter,
        PlatformTransactionManager transactionManager,
        LedgerStreamService streamService
    ) {
        PostgresLedgerEngine engine = new PostgresLedgerEngine(
            accountRepository,
            transactionRepository,
            walWriter,
            transactionManager
        );
        // Wire real-time telemetry stream listener
        engine.setEventListener(streamService::broadcast);
        return engine;
    }
}
