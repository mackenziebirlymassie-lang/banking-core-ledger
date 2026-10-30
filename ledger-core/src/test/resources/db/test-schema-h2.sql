-- ============================================================================
-- test-schema-h2.sql
-- H2 Schema in PostgreSQL Compatibility Mode for Ledger Integration Tests
-- ============================================================================

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY,
    account_number VARCHAR(32) UNIQUE NOT NULL,
    currency CHAR(3) NOT NULL,
    type VARCHAR(16) NOT NULL,
    allow_negative_balance BOOLEAN NOT NULL DEFAULT FALSE,
    posted_debits BIGINT NOT NULL DEFAULT 0 CHECK (posted_debits >= 0),
    posted_credits BIGINT NOT NULL DEFAULT 0 CHECK (posted_credits >= 0),
    pending_debits BIGINT NOT NULL DEFAULT 0 CHECK (pending_debits >= 0),
    pending_credits BIGINT NOT NULL DEFAULT 0 CHECK (pending_credits >= 0),
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_account_available_balance CHECK (
        allow_negative_balance = TRUE OR (
            CASE
                WHEN type IN ('ASSET', 'EXPENSE') THEN (posted_debits - posted_credits - pending_credits) >= 0
                ELSE (posted_credits - posted_debits - pending_debits) >= 0
            END
        )
    )
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
    sequence_num BIGSERIAL PRIMARY KEY,
    id UUID UNIQUE NOT NULL,
    idempotency_key VARCHAR(64) UNIQUE NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    status VARCHAR(16) NOT NULL,
    parent_transaction_id UUID,
    posted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    prev_hash VARCHAR(64) NOT NULL,
    hash VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS postings (
    id UUID PRIMARY KEY,
    transaction_id UUID NOT NULL,
    account_id UUID NOT NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    direction VARCHAR(6) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    sequence_index INT NOT NULL,
    CONSTRAINT uq_transaction_sequence UNIQUE (transaction_id, sequence_index),
    FOREIGN KEY (transaction_id) REFERENCES ledger_transactions(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- Register Immutability Trigger
DROP TRIGGER IF EXISTS trg_postings_immutable;
CREATE TRIGGER trg_postings_immutable
BEFORE UPDATE OR DELETE ON postings
FOR EACH ROW
CALL "com.bank.ledger.repository.h2.H2PostingsImmutabilityTrigger";

-- Register Double-Entry Balance Trigger
DROP TRIGGER IF EXISTS trg_postings_balance;
CREATE TRIGGER trg_postings_balance
AFTER INSERT ON postings
FOR EACH ROW
CALL "com.bank.ledger.repository.h2.H2PostingsBalanceTrigger";
