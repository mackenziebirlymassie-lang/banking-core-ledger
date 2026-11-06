# Core Banking & Double-Entry Ledger Engine

[![Java 21](https://img.shields.io/badge/Java-21%20LTS-007396?logo=openjdk&logoColor=white)](https://openjdk.org/projects/jdk/21/)
[![Spring Boot 3.2](https://img.shields.io/badge/Spring%20Boot-3.2.4-6DB33F?logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![Virtual Threads](https://img.shields.io/badge/Loom-Virtual%20Threads-orange)](#concurrency-model)
[![React 19](https://img.shields.io/badge/React-19.3-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![ACID Compliant](https://img.shields.io/badge/ACID-Compliant-success)](#financial-invariants--guarantees)
[![SHA-256 Audit Chain](https://img.shields.io/badge/Audit-SHA--256%20Chain-blueviolet)](#cryptographic-audit-trail--wal)

An ultra-resilient, ACID-compliant double-entry ledger and core banking engine engineered for zero financial discrepancy across multi-currency accounts. Features continuous SHA-256 Merkle/hash chaining, binary Write-Ahead Logging (WAL), deterministic deadlock-free concurrency via Java 21 Virtual Threads, and a Bloomberg-grade high-density treasury terminal.

---

## Table of Contents

- [Architectural Principles & Financial Invariants](#architectural-principles--financial-invariants)
- [System Architecture](#system-architecture)
- [Repository Structure](#repository-structure)
- [Quick Start Guide](#quick-start-guide)
  - [Option A: 1-Click Native Windows Launcher](#option-a-1-click-native-windows-launcher)
  - [Option B: Zero-Dependency Standalone Offline Console](#option-b-zero-dependency-standalone-offline-console)
  - [Option C: Production Fat JAR](#option-c-production-fat-jar)
  - [Option D: Full Local Development](#option-d-full-local-development)
- [REST API & SSE Telemetry](#rest-api--sse-telemetry)
- [Cryptographic Audit Trail & WAL Verification](#cryptographic-audit-trail--wal-verification)
- [Treasury Dashboard & Client Kernel](#treasury-dashboard--client-kernel)
- [Configuration & Database Switching](#configuration--database-switching)
- [Testing & Quality Assurance](#testing--quality-assurance)

---

## Architectural Principles & Financial Invariants

```
                      ┌──────────────────────────────────────────────┐
                      │        Transfer Request (Idempotent)         │
                      └──────────────────────┬───────────────────────┘
                                             │
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │    Deterministic Lock Ordering by UUID       │
                      │        Account(A) ───► Account(B)            │
                      └──────────────────────┬───────────────────────┘
                                             │
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │    Double-Entry Invariant Validation         │
                      │          Σ Debits == Σ Credits               │
                      └──────────────────────┬───────────────────────┘
                                             │
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │        Append-Only Ledger Persistence        │
                      │   (Postings Trigger Rejects UPDATE/DELETE)   │
                      └──────────────────────┬───────────────────────┘
                                             │
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │    Continuous SHA-256 Hash Chain Node        │
                      │  H(n) = SHA256(H(n-1) || PayloadHash(n))     │
                      └──────────────────────┬───────────────────────┘
                                             │
                      ┌──────────────────────┴───────────────────────┐
                      ▼                                              ▼
       ┌─────────────────────────────┐                ┌─────────────────────────────┐
       │   Binary WAL Frame Append   │                │   SSE Event Stream Emitter  │
       │    (ledger.wal + CRC32)     │                │   (/api/v1/stream/txs)      │
       └─────────────────────────────┘                └─────────────────────────────┘
```

The system enforces six immutable banking invariants:

1. **Double-Entry Equilibrium ($\sum \text{Debits} == \sum \text{Credits}$)**:
   Every transaction consists of at least two balanced postings where total debits strictly equal total credits. Non-zero balances are rejected before commit both in-memory and at the database level via deferred constraint triggers (`trg_verify_transaction_balance`).
2. **Strict Append-Only Immutability**:
   Financial postings and transactions are strictly immutable. No `UPDATE` or `DELETE` statements are permitted. Correction is accomplished exclusively through explicit, balanced reversal transactions. Database triggers (`trg_prevent_postings_modification`) enforce this at the persistence engine level.
3. **64-Bit Minor Currency Units**:
   All monetary amounts are represented as 64-bit signed integers (`BIGINT` in SQL, `long` in Java and TypeScript) in minor units (e.g., USD cents, EUR cents, JPY yen) to eliminate floating-point rounding errors and IEEE 754 precision decay.
4. **Deterministic Deadlock-Free Lock Ordering**:
   During concurrent multi-account transfers, accounts are sorted and locked in deterministic lexicographical UUID order. This eliminates deadlock hazards under high-frequency cross-account payment storms.
5. **Idempotency Protection**:
   Every mutating transfer requires a distinct `Idempotency-Key` header. Duplicate or replayed requests with the same key safely return the original transaction record (`200 OK`) without re-execution.
6. **Two-Phase Commit (Hold & Settlement)**:
   Supports pending authorizations (`PENDING`), capture/settlement (`POSTED`), and voids (`VOIDED`), tracking `pending_debits` and `pending_credits` separately from posted balances to guarantee available balance safety.

---

## System Architecture

The project consists of two core engines and pre-packaged distributions:

| Component | Technology | Role |
| :--- | :--- | :--- |
| **`ledger-core`** | Java 21, Spring Boot 3.2, Virtual Threads, H2 / PostgreSQL, Flyway | Production-grade ledger backend, ACID transactional engine, binary WAL writer, SHA-256 hash chaining, REST API & SSE streaming. |
| **`ledger-ui`** | React 19, TypeScript, Vite, TanStack Virtual, Lucide Icons | High-density treasury workstation featuring 60fps virtualized ledger tables, account statements, audit inspector, audio telemetry, and settings console. |
| **`EmbeddedLedgerKernel`** | Pure TypeScript (FIPS 180-4 SHA-256) | In-memory client-side ledger engine that allows the frontend to run 100% offline with zero dependencies. |
| **`release/`** | C# .NET Launcher, Fat JAR, Standalone HTML | Pre-built artifacts ready for immediate deployment on Windows, macOS, and Linux. |

---

## Repository Structure

```
core-banking-ledger/
├── ledger-core/                     # Core Java Banking & Ledger Service
│   ├── pom.xml                      # Maven project configuration (Java 21, Spring Boot 3.2.4)
│   ├── test.ps1                     # Automated test runner with portable JDK/Maven detection
│   └── src/
│       ├── main/java/com/bank/ledger/
│       │   ├── LedgerApplication.java       # Spring Boot main entrypoint
│       │   ├── api/                         # REST & SSE Controllers (Accounts, Transfers, Audit, Simulator)
│       │   ├── config/                      # Database & ThreadPool auto-configuration
│       │   ├── crypto/                      # SHA-256 Hash Chaining Service
│       │   ├── domain/                      # Account, Posting, LedgerTransaction domain models
│       │   ├── engine/                      # Core double-entry validator & balance math
│       │   ├── launcher/                    # Desktop auto-launch integration
│       │   ├── repository/                  # PostgreSQL / H2 JDBC Ledger Engine & DB triggers
│       │   ├── seed/                        # Institutional 25-transaction demo dataset seeder
│       │   ├── service/                     # SSE broadcast stream service
│       │   └── wal/                         # Binary Write-Ahead Log writer & Merkle audit verifier
│       └── main/resources/
│           ├── application.yml              # Profiles: default (H2 PostgreSQL mode) & postgres
│           ├── db/migration/                # Flyway DDL migrations with constraint triggers
│           └── static/                      # Embedded production Vite UI assets
├── ledger-ui/                       # High-Density Treasury Console
│   ├── package.json                 # React 19, TanStack Virtual, Vite, Oxlint
│   ├── vite.config.ts               # Standard multi-asset Vite build config
│   ├── vite.config.singlefile.ts    # Single-file HTML inliner config
│   └── src/
│       ├── App.tsx                  # Main treasury dashboard workbench
│       ├── api/LedgerClient.ts      # Dual-mode client (Auto-negotiates Remote HTTP/SSE vs. Embedded Kernel)
│       ├── components/              # Virtualized tables, modals, drawers, and headers
│       ├── engine/                  # EmbeddedLedgerKernel.ts (standalone offline TypeScript engine)
│       ├── settings/                # Institutional settings context & localStorage sync
│       └── utils/                   # Money formatting and Web Audio acoustic feedback
├── release/                         # Ready-to-Run Distribution Bundles
│   ├── CoreBankingLedger.exe        # 1-Click native Windows executable (with embedded multi-LOD icon)
│   ├── ledger-all-in-one.jar        # Spring Boot Fat JAR (backend + inlined web console)
│   ├── CoreBankingLedger-Standalone.html # Zero-dependency single-file offline distribution
│   └── Stop-Ledger-Server.bat       # Graceful server shutdown utility
└── scripts/                         # Automation & Tooling
    ├── Launcher.cs                  # C# source for CoreBankingLedger.exe
    ├── smoke-test.ps1               # Automated end-to-end smoke test script
    └── generate_multilod_icons.py   # Multi-resolution icon generation pipeline
```

---

## Quick Start Guide

### Option A: 1-Click Native Windows Launcher

For Windows workstations with Java 21 installed:
1. Navigate to the `release/` directory.
2. Double-click **`CoreBankingLedger.exe`**.
3. The launcher will automatically start the background ledger engine, verify backend health on `http://localhost:8080`, and launch your default browser straight into the treasury console.

To stop the background server:
```cmd
release\Stop-Ledger-Server.bat
```

### Option B: Zero-Dependency Standalone Offline Console

No Java or Node.js required:
1. Open **`release/CoreBankingLedger-Standalone.html`** in any modern web browser (Edge, Chrome, Firefox, Safari).
2. The UI automatically activates the **Embedded Ledger Kernel**:
   - Executes double-entry accounting in pure client-side TypeScript.
   - Computes deterministic SHA-256 transaction hash chains.
   - Saves state seamlessly to browser `localStorage`.
   - Supports live transfers, account creation, and burst stress simulations.

### Option C: Production Fat JAR

Run the all-in-one Spring Boot jar (includes embedded H2 database and inlined UI):

```bash
# Requires JDK 21+
java --enable-preview -jar release/ledger-all-in-one.jar
```

Access the UI at `http://localhost:8080`.

### Option D: Full Local Development

#### 1. Backend (`ledger-core`)
```powershell
cd ledger-core
# Run unit and integration tests
.\test.ps1

# Or run directly via Maven
mvn spring-boot:run
```

#### 2. Frontend (`ledger-ui`)
```powershell
cd ledger-ui
npm install
npm run dev
```
The Vite development server runs on `http://localhost:5173` and proxies API requests to `http://localhost:8080`.

To build the standalone single-file HTML artifact:
```powershell
npm run build:single
```

---

## REST API & SSE Telemetry

The backend exposes a clean RESTful interface alongside a real-time Server-Sent Events (SSE) telemetry feed.

### Base URL
```
http://localhost:8080/api/v1
```

### Summary of Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/accounts` | List all ledger accounts with debits, credits, and net balances. |
| `POST` | `/accounts` | Create a new asset, liability, equity, revenue, or expense account. |
| `GET` | `/accounts/{id}` | Retrieve account details by UUID. |
| `GET` | `/accounts/{id}/statement` | Paginated transaction statement with running balance calculation. |
| `GET` | `/transactions` | Cursor-paginated ledger transactions with postings and hash signatures. |
| `GET` | `/transactions/{id}` | Retrieve specific transaction with full posting breakdown. |
| `POST` | `/transfers` | Execute an atomic double-entry transfer (simple 2-leg or multi-leg). |
| `POST` | `/transfers/hold` | Place a two-phase authorization hold on an account. |
| `POST` | `/transfers/{id}/settle` | Settle an authorized hold into permanent posted balance. |
| `POST` | `/transfers/{id}/void` | Void an authorized hold and release held balance. |
| `GET` | `/audit/verify` | Perform full cryptographic verification of the SHA-256 chain and WAL. |
| `POST` | `/simulator/burst` | Execute a concurrent burst test across Virtual Threads. |
| `GET` | `/stream/transactions` | SSE stream for real-time transaction and balance notifications. |

### API Usage Examples

#### 1. Execute an Atomic Transfer (Double-Entry)
```bash
curl -X POST http://localhost:8080/api/v1/transfers \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: e4b25bf0-3a56-4b21-b3b2-6c1743a4e401" \
  -d '{
    "sourceAccountId": "a1000000-0000-0000-0000-000000000001",
    "destinationAccountId": "b2000000-0000-0000-0000-000000000002",
    "amountMinor": 25000,
    "description": "Liquidity disbursement to operating account"
  }'
```

#### 2. Multi-Leg Balanced Transfer
```bash
curl -X POST http://localhost:8080/api/v1/transfers \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: b7b45450-9bb4-4cfb-b5cb-3dfcb8876c12" \
  -d '{
    "description": "Merchant settlement with processing fee split",
    "legs": [
      { "accountId": "a1000000-0000-0000-0000-000000000001", "amountMinor": 10000, "direction": "DEBIT" },
      { "accountId": "b2000000-0000-0000-0000-000000000002", "amountMinor": 9750, "direction": "CREDIT" },
      { "accountId": "c3000000-0000-0000-0000-000000000003", "amountMinor": 250, "direction": "CREDIT" }
    ]
  }'
```

#### 3. Cryptographic Chain Audit Verification
```bash
curl http://localhost:8080/api/v1/audit/verify
```
**Sample Response:**
```json
{
  "totalTransactions": 25,
  "chainValid": true,
  "brokenSequences": [],
  "merkleRoot": "a3f5b721869e9c8f61543be2ffb58bfa17c6b90f4e3c98d6c7b94c3917d23a41",
  "walFramesVerified": 25,
  "walSynchronized": true,
  "verificationDurationMs": 4
}
```

#### 4. Real-Time Telemetry Stream (SSE)
```bash
curl -N http://localhost:8080/api/v1/stream/transactions
```

---

## Cryptographic Audit Trail & WAL Verification

To guarantee non-repudiation and prevent historical tampering:

- **Continuous SHA-256 Hash Chaining**:
  Every transaction computes a deterministic payload hash and links it to the previous transaction's hash:
  $$\text{Hash}_n = \text{SHA-256}(\text{Hash}_{n-1} \parallel \text{Seq}_n \parallel \text{TxId}_n \parallel \text{PayloadHash}_n)$$
- **Binary Write-Ahead Log (`data/ledger.wal`)**:
  Every transaction frame is serialized to a binary log file with magic bytes (`0x4C454447` - `LEDG`), protocol version, monotonic sequence, timestamp, payload bytes, and CRC32 checksum.
- **Audit Verification Engine (`AuditVerifierService`)**:
  Performs complete traversal over the persistence layer and binary WAL:
  - Re-computes SHA-256 for all ledger transactions from the genesis block ($H_0$).
  - Confirms strict monotonic sequence progression ($1, 2, 3, \dots, N$).
  - Cross-references database hashes against binary WAL frames.
  - Generates real-time verification reports displayed in the treasury workbench.

---

## Treasury Dashboard & Client Kernel

The user interface is designed for institutional treasury operations, prioritizing density, readability, and clarity:

- **Virtualized High-Throughput Ledger Table**: Powered by `@tanstack/react-virtual`, smoothly scrolling over 100,000+ postings with zero frame drops.
- **Dual Engine Architecture**:
  - `REMOTE_HTTP_SSE`: Connects to the Spring Boot Java backend with live SSE updates.
  - `EMBEDDED_KERNEL`: Automatically active when running standalone; computes balances and SHA-256 hashes locally in TypeScript.
- **Mechanical Audio Feedback**: Optional subtle acoustic ticks and chime frequencies synthesized via the browser's Web Audio API for transaction commits, audit runs, and errors.
- **Interactive Modals & Drawers**:
  - **Account Statement Modal**: Double-entry running balance drill-down with date and direction filtering.
  - **Audit Inspector Drawer**: Real-time hash chain visualization, previous hash links, and payload JSON inspector.
  - **Burst Load Generator**: UI-triggered concurrent stress testing simulating up to 1,000 tx/burst.
  - **Settings Console**: Configurable audio volume, telemetry refresh intervals, and local snapshot backups.

---

## Configuration & Database Switching

Configuration is managed via `application.yml` or environment variables:

```yaml
server:
  port: 8080

spring:
  threads:
    virtual:
      enabled: true
  datasource:
    # Default: Embedded H2 in PostgreSQL compatibility mode
    url: jdbc:h2:file:./data/core_ledger;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;AUTO_SERVER=TRUE
    driver-class-name: org.h2.Driver
```

### Switching to Enterprise PostgreSQL
To connect to an external PostgreSQL 16+ instance:

```bash
export SPRING_PROFILES_ACTIVE=postgres
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/ledger
export SPRING_DATASOURCE_USERNAME=postgres
export SPRING_DATASOURCE_PASSWORD=your_secret_password
java --enable-preview -jar release/ledger-all-in-one.jar
```

Flyway will automatically apply the migration script (`V1__init_ledger_schema.sql`), configuring PostgreSQL enums, deferred constraint triggers, and append-only guards.

---

## Testing & Quality Assurance

### Automated Unit & Integration Tests

```powershell
# Run backend test suite (Spring Boot JDBC, PostgreSQL triggers, H2, Concurrency)
cd ledger-core
.\test.ps1
```

### End-to-End System Smoke Test

The repository includes a comprehensive smoke test script verifying the native Windows launcher, port readiness, REST endpoints, transaction creation, and the 25-transaction cryptographic audit chain:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\smoke-test.ps1
```

---

## License

Institutional Proprietary / MIT Compatible. Designed for mission-critical core banking and fintech infrastructure.
