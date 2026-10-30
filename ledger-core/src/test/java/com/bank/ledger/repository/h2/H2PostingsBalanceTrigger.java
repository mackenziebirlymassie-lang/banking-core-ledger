package com.bank.ledger.repository.h2;

import org.h2.api.Trigger;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

/**
 * H2 Trigger enforcing double-entry sum(debits) - sum(credits) == 0 constraint.
 */
public class H2PostingsBalanceTrigger implements Trigger {

    @Override
    public void init(Connection conn, String schemaName, String triggerName, String tableName, boolean before, int type) {
    }

    @Override
    public void fire(Connection conn, Object[] oldRow, Object[] newRow) throws SQLException {
        // newRow: [id, transaction_id, account_id, amount, direction, sequence_index]
        Object txId = newRow[1];
        if (txId == null) return;

        String sql = """
            SELECT 
                COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END), 0) AS net_balance,
                COUNT(*) AS cnt
            FROM postings
            WHERE transaction_id = ?
            """;

        try (PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setObject(1, txId);
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    long net = rs.getLong("net_balance");
                    int cnt = rs.getInt("cnt");
                    // In deferred trigger check (called on commit/transaction end)
                    if (cnt >= 2 && net != 0) {
                        throw new SQLException("Unbalanced transaction constraint violation: discrepancy of " + net + " minor units.");
                    }
                }
            }
        }
    }

    @Override
    public void close() {
    }

    @Override
    public void remove() {
    }
}
