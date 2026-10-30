-- ============================================================================
-- V1__init_ledger_schema.sql
-- Production PostgreSQL DDL Schema for Core Banking & Double-Entry Ledger Engine
-- ============================================================================

-- 1. Enum Types
DO $$ BEGIN
    CREATE TYPE account_type AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE transfer_status AS ENUM ('PENDING', 'POSTED', 'VOIDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Accounts Table
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY,
    account_number VARCHAR(32) UNIQUE NOT NULL,
    currency CHAR(3) NOT NULL,
    type account_type NOT NULL,
    allow_negative_balance BOOLEAN NOT NULL DEFAULT FALSE,
    posted_debits BIGINT NOT NULL DEFAULT 0 CHECK (posted_debits >= 0),
    posted_credits BIGINT NOT NULL DEFAULT 0 CHECK (posted_credits >= 0),
    pending_debits BIGINT NOT NULL DEFAULT 0 CHECK (pending_debits >= 0),
    pending_credits BIGINT NOT NULL DEFAULT 0 CHECK (pending_credits >= 0),
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Database-level check enforcing that non-overdraftable accounts cannot have negative available balance
    CONSTRAINT chk_account_available_balance CHECK (
        allow_negative_balance = TRUE OR (
            CASE
                WHEN type IN ('ASSET', 'EXPENSE') THEN (posted_debits - posted_credits - pending_credits) >= 0
                ELSE (posted_credits - posted_debits - pending_debits) >= 0
            END
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_accounts_currency ON accounts (currency);
CREATE INDEX IF NOT EXISTS idx_accounts_account_number ON accounts (account_number);

-- 3. Ledger Transactions Table
CREATE TABLE IF NOT EXISTS ledger_transactions (
    sequence_num BIGSERIAL UNIQUE NOT NULL,
    id UUID PRIMARY KEY,
    idempotency_key VARCHAR(64) UNIQUE NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    status transfer_status NOT NULL,
    parent_transaction_id UUID REFERENCES ledger_transactions(id),
    posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    prev_hash VARCHAR(64) NOT NULL,
    hash VARCHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_seq ON ledger_transactions (sequence_num);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_idempotency ON ledger_transactions (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_posted_at ON ledger_transactions (posted_at);

-- 4. Postings Table
CREATE TABLE IF NOT EXISTS postings (
    id UUID PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES ledger_transactions(id),
    account_id UUID NOT NULL REFERENCES accounts(id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    direction VARCHAR(6) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    sequence_index INT NOT NULL,
    CONSTRAINT uq_transaction_sequence UNIQUE (transaction_id, sequence_index)
);

CREATE INDEX IF NOT EXISTS idx_postings_transaction_id ON postings (transaction_id);
CREATE INDEX IF NOT EXISTS idx_postings_account_id ON postings (account_id);

-- ============================================================================
-- 5. Database-Level Double-Entry Invariant Enforcement (Constraint Trigger)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_verify_transaction_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_net_balance BIGINT;
    v_posting_count INT;
BEGIN
    SELECT 
        COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE -amount END), 0),
        COUNT(*)
    INTO 
        v_net_balance, 
        v_posting_count
    FROM postings
    WHERE transaction_id = NEW.transaction_id;

    IF v_posting_count < 2 THEN
        RAISE EXCEPTION 'Double-entry constraint violation: transaction % must have at least 2 postings, got %',
            NEW.transaction_id, v_posting_count;
    END IF;

    IF v_net_balance <> 0 THEN
        RAISE EXCEPTION 'Unbalanced transaction constraint violation: transaction % has non-zero net balance discrepancy of % minor units',
            NEW.transaction_id, v_net_balance;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verify_transaction_balance ON postings;

CREATE CONSTRAINT TRIGGER trg_verify_transaction_balance
AFTER INSERT ON postings
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_verify_transaction_balance();

-- ============================================================================
-- 6. Append-Only Immutability Enforcement Triggers
-- ============================================================================

-- A. Postings are strictly append-only (no UPDATE or DELETE)
CREATE OR REPLACE FUNCTION fn_prevent_postings_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Immutability violation: Postings table is append-only. UPDATE and DELETE operations are prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_postings_modification ON postings;

CREATE TRIGGER trg_prevent_postings_modification
BEFORE UPDATE OR DELETE ON postings
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_postings_modification();

-- B. Ledger Transactions cannot be deleted or have their cryptographic audit trail altered
CREATE OR REPLACE FUNCTION fn_prevent_transaction_tampering()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Immutability violation: Ledger transactions cannot be deleted.';
    END IF;

    -- Only status updates (e.g., PENDING -> POSTED / VOIDED) are allowed
    IF NEW.id <> OLD.id OR
       NEW.sequence_num <> OLD.sequence_num OR
       NEW.idempotency_key <> OLD.idempotency_key OR
       NEW.prev_hash <> OLD.prev_hash OR
       NEW.payload_hash <> OLD.payload_hash THEN
        RAISE EXCEPTION 'Tamper violation: modification of transaction identifier, sequence, idempotency key, or cryptographic hashes is strictly prohibited.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_transaction_tampering ON ledger_transactions;

CREATE TRIGGER trg_prevent_transaction_tampering
BEFORE UPDATE OR DELETE ON ledger_transactions
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_transaction_tampering();
