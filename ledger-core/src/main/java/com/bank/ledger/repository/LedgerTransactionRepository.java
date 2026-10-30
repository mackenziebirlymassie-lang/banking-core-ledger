package com.bank.ledger.repository;

import com.bank.ledger.domain.Direction;
import com.bank.ledger.domain.LedgerTransaction;
import com.bank.ledger.domain.Posting;
import com.bank.ledger.domain.TransferStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * High-performance repository for Ledger Transactions and Postings.
 */
public class LedgerTransactionRepository {

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public LedgerTransactionRepository(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public record TransactionRecord(
        long sequenceNum,
        LedgerTransaction transaction,
        String prevHash,
        String payloadHash
    ) {}

    public void insertTransaction(
        LedgerTransaction tx,
        String prevHash,
        String payloadHash
    ) {
        String sql = """
            INSERT INTO ledger_transactions (
                id, idempotency_key, payload_hash, description,
                status, posted_at, prev_hash, hash
            ) VALUES (
                :id, :idempotencyKey, :payloadHash, :description,
                :status, :postedAt, :prevHash, :hash
            )
            """;

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("id", tx.id())
            .addValue("idempotencyKey", tx.idempotencyKey())
            .addValue("payloadHash", payloadHash)
            .addValue("description", tx.description())
            .addValue("status", tx.status().name())
            .addValue("postedAt", Timestamp.from(tx.postedAt()))
            .addValue("prevHash", prevHash)
            .addValue("hash", tx.hash());

        jdbcTemplate.update(sql, params);
    }

    public void insertPostings(List<Posting> postings) {
        if (postings.isEmpty()) return;

        String sql = """
            INSERT INTO postings (
                id, transaction_id, account_id, amount, direction, sequence_index
            ) VALUES (
                :id, :transactionId, :accountId, :amount, :direction, :sequenceIndex
            )
            """;

        MapSqlParameterSource[] batchParams = postings.stream()
            .map(p -> new MapSqlParameterSource()
                .addValue("id", p.id())
                .addValue("transactionId", p.transactionId())
                .addValue("accountId", p.accountId())
                .addValue("amount", p.amount())
                .addValue("direction", p.direction().name())
                .addValue("sequenceIndex", p.sequenceIndex()))
            .toArray(MapSqlParameterSource[]::new);

        jdbcTemplate.batchUpdate(sql, batchParams);
    }

    public Optional<TransactionRecord> findById(UUID id) {
        String sql = "SELECT * FROM ledger_transactions WHERE id = :id";
        List<TransactionRecord> results = jdbcTemplate.query(sql, Map.of("id", id), this::mapTransactionRecord);
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    public Optional<TransactionRecord> findByIdempotencyKey(String key) {
        String sql = "SELECT * FROM ledger_transactions WHERE idempotency_key = :key";
        List<TransactionRecord> results = jdbcTemplate.query(sql, Map.of("key", key), this::mapTransactionRecord);
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    public Optional<TransactionRecord> findLatestTransaction() {
        String sql = """
            SELECT * FROM ledger_transactions
            ORDER BY sequence_num DESC
            LIMIT 1
            """;
        List<TransactionRecord> results = jdbcTemplate.query(sql, Map.of(), this::mapTransactionRecord);
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    public void updateTransactionStatus(UUID id, TransferStatus newStatus, String newHash) {
        String sql = """
            UPDATE ledger_transactions
            SET status = :status, hash = :hash
            WHERE id = :id
            """;
        jdbcTemplate.update(sql, Map.of(
            "id", id,
            "status", newStatus.name(),
            "hash", newHash
        ));
    }

    public List<Posting> findPostingsByTransactionId(UUID transactionId) {
        String sql = """
            SELECT id, transaction_id, account_id, amount, direction, sequence_index
            FROM postings
            WHERE transaction_id = :txId
            ORDER BY sequence_index ASC
            """;
        return jdbcTemplate.query(sql, Map.of("txId", transactionId), (rs, rowNum) -> new Posting(
            UUID.fromString(rs.getString("id")),
            UUID.fromString(rs.getString("transaction_id")),
            UUID.fromString(rs.getString("account_id")),
            rs.getLong("amount"),
            Direction.valueOf(rs.getString("direction")),
            rs.getInt("sequence_index")
        ));
    }

    private TransactionRecord mapTransactionRecord(ResultSet rs, int rowNum) throws SQLException {
        long seq = rs.getLong("sequence_num");
        UUID id = UUID.fromString(rs.getString("id"));
        String idempotencyKey = rs.getString("idempotency_key");
        String payloadHash = rs.getString("payload_hash");
        String description = rs.getString("description");
        TransferStatus status = TransferStatus.valueOf(rs.getString("status"));
        Instant postedAt = rs.getTimestamp("posted_at").toInstant().truncatedTo(ChronoUnit.MILLIS);
        String prevHash = rs.getString("prev_hash");
        String hash = rs.getString("hash");

        List<Posting> postings = findPostingsByTransactionId(id);

        LedgerTransaction tx = new LedgerTransaction(
            id,
            idempotencyKey,
            description,
            postedAt,
            status,
            postings,
            hash
        );

        return new TransactionRecord(seq, tx, prevHash, payloadHash);
    }
}
