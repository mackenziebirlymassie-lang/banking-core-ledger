package com.bank.ledger.repository;

import com.bank.ledger.domain.Account;
import com.bank.ledger.domain.AccountType;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * High-performance repository for Account entities implementing deterministic row locking.
 */
public class AccountRepository {

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public AccountRepository(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void insert(Account account) {
        String sql = """
            INSERT INTO accounts (
                id, account_number, currency, type, allow_negative_balance,
                posted_debits, posted_credits, pending_debits, pending_credits,
                version, created_at
            ) VALUES (
                :id, :accountNumber, :currency, :type, :allowNegativeBalance,
                :postedDebits, :postedCredits, :pendingDebits, :pendingCredits,
                :version, NOW()
            )
            """;

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("id", account.getId())
            .addValue("accountNumber", account.getAccountNumber())
            .addValue("currency", account.getCurrency())
            .addValue("type", account.getType().name())
            .addValue("allowNegativeBalance", account.isAllowNegativeBalance())
            .addValue("postedDebits", account.getPostedDebits())
            .addValue("postedCredits", account.getPostedCredits())
            .addValue("pendingDebits", account.getPendingDebits())
            .addValue("pendingCredits", account.getPendingCredits())
            .addValue("version", account.getVersion());

        jdbcTemplate.update(sql, params);
    }

    public Optional<Account> findById(UUID id) {
        String sql = "SELECT * FROM accounts WHERE id = :id";
        List<Account> results = jdbcTemplate.query(sql, Map.of("id", id), new AccountRowMapper());
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    /**
     * Acquires pessimistic row-level locks on accounts in strictly ascending natural UUID order.
     * Guaranteed to prevent deadlocks across distributed database sessions.
     */
    public List<Account> lockAccountsForUpdate(List<UUID> accountIds) {
        if (accountIds.isEmpty()) {
            return List.of();
        }

        // 1. Sort strictly in ascending natural order
        List<UUID> sortedIds = accountIds.stream()
            .distinct()
            .sorted(Comparator.naturalOrder())
            .toList();

        // 2. Execute SELECT ... FOR UPDATE
        String sql = """
            SELECT * FROM accounts
            WHERE id IN (:ids)
            ORDER BY id ASC
            FOR UPDATE
            """;

        return jdbcTemplate.query(sql, Map.of("ids", sortedIds), new AccountRowMapper());
    }

    /**
     * Atomically updates account balances and increments version (optimistic check).
     */
    public boolean updateBalances(Account account, long expectedVersion) {
        String sql = """
            UPDATE accounts SET
                posted_debits = :postedDebits,
                posted_credits = :postedCredits,
                pending_debits = :pendingDebits,
                pending_credits = :pendingCredits,
                version = :newVersion
            WHERE id = :id AND version = :expectedVersion
            """;

        MapSqlParameterSource params = new MapSqlParameterSource()
            .addValue("id", account.getId())
            .addValue("postedDebits", account.getPostedDebits())
            .addValue("postedCredits", account.getPostedCredits())
            .addValue("pendingDebits", account.getPendingDebits())
            .addValue("pendingCredits", account.getPendingCredits())
            .addValue("newVersion", expectedVersion + 1)
            .addValue("expectedVersion", expectedVersion);

        int updated = jdbcTemplate.update(sql, params);
        return updated == 1;
    }

    private static class AccountRowMapper implements RowMapper<Account> {
        @Override
        public Account mapRow(ResultSet rs, int rowNum) throws SQLException {
            UUID id = UUID.fromString(rs.getString("id"));
            String accNum = rs.getString("account_number");
            String currency = rs.getString("currency").trim();
            AccountType type = AccountType.valueOf(rs.getString("type"));
            boolean allowNegative = rs.getBoolean("allow_negative_balance");

            long postedDebits = rs.getLong("posted_debits");
            long postedCredits = rs.getLong("posted_credits");
            long pendingDebits = rs.getLong("pending_debits");
            long pendingCredits = rs.getLong("pending_credits");
            long version = rs.getLong("version");

            return new Account(
                id, accNum, currency, type, allowNegative,
                postedDebits, postedCredits, pendingDebits, pendingCredits, version
            );
        }
    }
}
