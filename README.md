# Core Banking & Double-Entry Ledger Engine

An ultra-resilient, ACID-compliant double-entry ledger and core banking engine designed for zero financial discrepancy across multi-currency accounts.

## Project Structure

```
banking-core-ledger/
├── backend/       # Java core accounting engine, invariant validator, and REST/gRPC API
├── frontend/      # TypeScript + React + HTML5 + CSS3 high-density treasury dashboard
└── docs/          # Architecture specs, database schemas, and accounting invariant proofs
```

## Architecture Principles

1. **Double-Entry Invariant**: Every transaction consists of balanced postings where:
   $$\sum \text{Debits} == \sum \text{Credits}$$
2. **Immutability**: Ledger transactions are append-only. No updates or deletes. Reversals create explicit new balancing transactions.
3. **Integer Arithmetic**: Minor currency units (e.g. cents) or high-precision fixed point numbers to eliminate floating-point rounding errors.
4. **Idempotency & Concurrency**: Unique idempotency keys prevent duplicate charges, and deterministic lock ordering prevents deadlocks under high-concurrency transfers.
