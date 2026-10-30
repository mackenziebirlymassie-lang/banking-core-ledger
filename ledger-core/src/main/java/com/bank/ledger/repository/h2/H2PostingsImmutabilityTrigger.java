package com.bank.ledger.repository.h2;

import org.h2.api.Trigger;

import java.sql.Connection;
import java.sql.SQLException;

/**
 * H2 Trigger enforcing that Postings are strictly append-only (no UPDATE or DELETE).
 */
public class H2PostingsImmutabilityTrigger implements Trigger {

    @Override
    public void init(Connection conn, String schemaName, String triggerName, String tableName, boolean before, int type) {
    }

    @Override
    public void fire(Connection conn, Object[] oldRow, Object[] newRow) throws SQLException {
        throw new SQLException("Immutability violation: Postings table is append-only. UPDATE and DELETE operations are prohibited.");
    }

    @Override
    public void close() {
    }

    @Override
    public void remove() {
    }
}
