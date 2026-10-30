package com.bank.ledger.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;

/**
 * Initializes database schema and triggers on application startup if not already created.
 */
@Component
@Order(1) // Runs before LedgerDataSeeder
public class DatabaseInitializer implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DatabaseInitializer.class);
    private final DataSource dataSource;

    public DatabaseInitializer(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        try (Connection conn = dataSource.getConnection()) {
            DatabaseMetaData meta = conn.getMetaData();
            String dbProduct = meta.getDatabaseProductName().toLowerCase();

            boolean exists = false;
            try (ResultSet rs = meta.getTables(null, null, "ACCOUNTS", null)) {
                if (rs.next()) exists = true;
            }
            if (!exists) {
                try (ResultSet rs = meta.getTables(null, null, "accounts", null)) {
                    if (rs.next()) exists = true;
                }
            }

            if (exists) {
                log.info("[DatabaseInitializer] Database schema already present for {}", dbProduct);
                return;
            }

            log.info("[DatabaseInitializer] Initializing ledger schema for {}", dbProduct);
            String schemaResource = dbProduct.contains("h2") ? "/db/schema-h2.sql" : "/db/migration/V1__init_ledger_schema.sql";

            try (InputStream in = getClass().getResourceAsStream(schemaResource)) {
                if (in == null) {
                    log.warn("Could not find schema resource: {}", schemaResource);
                    return;
                }
                String ddl = new String(in.readAllBytes(), StandardCharsets.UTF_8);
                try (Statement stmt = conn.createStatement()) {
                    for (String sql : ddl.split(";")) {
                        if (!sql.trim().isEmpty()) {
                            try {
                                stmt.execute(sql);
                            } catch (Exception ex) {
                                log.debug("DDL notice: {}", ex.getMessage());
                            }
                        }
                    }
                }
            }
            log.info("[DatabaseInitializer] Database schema initialized successfully.");
        }
    }
}
