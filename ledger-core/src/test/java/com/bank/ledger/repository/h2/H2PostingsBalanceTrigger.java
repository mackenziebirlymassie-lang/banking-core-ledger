package com.bank.ledger.repository.h2;

import com.bank.ledger.crypto.HashChainService;
import com.bank.ledger.domain.Direction;
import com.bank.ledger.domain.Posting;
import org.h2.api.Trigger;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * H2 Trigger enforcing double-entry sum(debits) - sum(credits) == 0 constraint.
 * Verifies balance once all postings for the transaction payload have been persisted.
 */
public class H2PostingsBalanceTrigger implements Trigger {

    @Override
    public void init(Connection conn, String schemaName, String triggerName, String tableName, boolean before, int type) {
    }

    @Override
    public void fire(Connection conn, Object[] oldRow, Object[] newRow) throws SQLException {
        // newRow: [id, transaction_id, account_id, amount, direction, sequence_index]
        Object txIdObj = newRow[1];
        if (txIdObj == null) return;
        UUID txId = txIdObj instanceof UUID ? (UUID) txIdObj : UUID.fromString(txIdObj.toString());

        String txSql = "SELECT payload_hash FROM ledger_transactions WHERE id = ?";
        String storedPayloadHash = null;
        try (PreparedStatement stmt = conn.prepareStatement(txSql)) {
            stmt.setObject(1, txId);
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    storedPayloadHash = rs.getString("payload_hash");
                }
            }
        }

        if (storedPayloadHash == null) {
            return;
        }

        String postingsSql = """
            SELECT id, transaction_id, account_id, amount, direction, sequence_index
            FROM postings
            WHERE transaction_id = ?
            ORDER BY sequence_index ASC
            """;

        List<Posting> postings = new ArrayList<>();
        long totalDebits = 0L;
        long totalCredits = 0L;

        try (PreparedStatement stmt = conn.prepareStatement(postingsSql)) {
            stmt.setObject(1, txId);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    UUID postId = UUID.fromString(rs.getString("id"));
                    UUID accId = UUID.fromString(rs.getString("account_id"));
                    long amount = rs.getLong("amount");
                    Direction direction = Direction.valueOf(rs.getString("direction"));
                    int seqIdx = rs.getInt("sequence_index");

                    if (direction == Direction.DEBIT) {
                        totalDebits += amount;
                    } else {
                        totalCredits += amount;
                    }
                    postings.add(new Posting(postId, txId, accId, amount, direction, seqIdx));
                }
            }
        }

        String currentPayloadHash = HashChainService.computePayloadHash(postings);
        if (currentPayloadHash.equalsIgnoreCase(storedPayloadHash)) {
            if (postings.size() < 2 || totalDebits != totalCredits) {
                throw new SQLException(String.format(
                    "Unbalanced transaction constraint violation: total debits (%d) != total credits (%d)",
                    totalDebits, totalCredits
                ));
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
