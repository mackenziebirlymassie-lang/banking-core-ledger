import type {
  Account,
  AccountType,
  AuditReport,
  BurstSimulationPayload,
  BurstSimulationResponse,
  CreateAccountPayload,
  CreateHoldPayload,
  CreateTransferPayload,
  Direction,
  Posting,
  PostingLegPayload,
  StreamEvent,
  Transaction,
} from '../types/ledger';
import { calculateLegsBalance, formatMinor } from '../utils/money';

// Pure TypeScript SHA-256 (FIPS 180-4) Implementation
// Guarantees deterministic SHA-256 execution across all environments including file:// origins.
function sha256(ascii: string): string {
  let i = 0, j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }

  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  const w = new Array(64);

  for (i = 0; i < words.length; i += 16) {
    const oldHash = hash.slice(0);

    for (j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[i + j] | 0;
      } else {
        const s0 =
          ((w[j - 15] >>> 7) | (w[j - 15] << 25)) ^
          ((w[j - 15] >>> 18) | (w[j - 15] << 14)) ^
          (w[j - 15] >>> 3);
        const s1 =
          ((w[j - 2] >>> 17) | (w[j - 2] << 15)) ^
          ((w[j - 2] >>> 19) | (w[j - 2] << 13)) ^
          (w[j - 2] >>> 10);
        w[j] = ((w[j - 16] + s0) | 0) + ((w[j - 7] + s1) | 0);
      }

      const s1 =
        ((hash[4] >>> 6) | (hash[4] << 26)) ^
        ((hash[4] >>> 11) | (hash[4] << 21)) ^
        ((hash[4] >>> 25) | (hash[4] << 7));
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const temp1 =
        ((((((hash[7] + s1) | 0) + ch) | 0) + k[j]) | 0) + w[j];
      const s0 =
        ((hash[0] >>> 2) | (hash[0] << 30)) ^
        ((hash[0] >>> 13) | (hash[0] << 19)) ^
        ((hash[0] >>> 22) | (hash[0] << 10));
      const maj =
        (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = (s0 + maj) | 0;

      hash = [
        (temp1 + temp2) | 0,
        hash[0],
        hash[1],
        hash[2],
        (hash[3] + temp1) | 0,
        hash[4],
        hash[5],
        hash[6],
      ];
    }

    for (j = 0; j < 8; j++) {
      hash[j] = (hash[j] + oldHash[j]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }

  return result;
}

// Compute Merkle Tree Root
function computeMerkleRoot(hashes: string[]): string {
  if (hashes.length === 0) {
    return '0000000000000000000000000000000000000000000000000000000000000000';
  }
  let currentLevel = [...hashes];
  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
      nextLevel.push(sha256(left + right));
    }
    currentLevel = nextLevel;
  }
  return currentLevel[0];
}

const STORAGE_KEY = 'CORE_BANKING_LEDGER_STANDALONE_V1';

interface StoredLedgerState {
  accounts: Account[];
  transactions: Transaction[];
  idempotencyMap: Record<string, { payloadHash: string; transactionId: string }>;
}

export class EmbeddedLedgerKernel {
  private accounts: Map<string, Account> = new Map();
  private transactions: Transaction[] = [];
  private idempotencyMap: Map<string, { payloadHash: string; transactionId: string }> = new Map();
  private listeners: ((event: StreamEvent) => void)[] = [];

  constructor() {
    try {
      this.loadOrSeed();
    } catch (err) {
      console.error('[EmbeddedLedgerKernel] Failed to load/seed:', err);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      this.accounts.clear();
      this.transactions = [];
      this.idempotencyMap.clear();
    }
  }

  public onEvent(listener: (event: StreamEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(event: StreamEvent) {
    this.listeners.forEach(l => l(event));
  }

  private saveState() {
    try {
      const state: StoredLedgerState = {
        accounts: Array.from(this.accounts.values()),
        transactions: this.transactions,
        idempotencyMap: Object.fromEntries(this.idempotencyMap.entries()),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // localStorage may fail in private mode; state stays in memory
    }
  }

  public resetState(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    this.accounts.clear();
    this.transactions = [];
    this.idempotencyMap.clear();
    this.seedInstitutionalLedger();
    this.saveState();
    this.emit({
      eventType: 'BURST_COMPLETED',
      timestamp: new Date().toISOString(),
      message: 'Ledger state reset to institutional seed',
    });
  }

  public async exportSnapshot(): Promise<string> {
    const report = await this.verifyAuditChain();
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      merkleRoot: report.merkleRoot,
      totalTransactions: this.transactions.length,
      accounts: Array.from(this.accounts.values()),
      transactions: this.transactions,
      idempotencyMap: Object.fromEntries(this.idempotencyMap.entries()),
    };
    return JSON.stringify(data, null, 2);
  }

  public async importSnapshot(jsonStr: string): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.accounts || !Array.isArray(data.accounts) || !data.transactions || !Array.isArray(data.transactions)) {
        return { success: false, count: 0, error: 'Invalid snapshot format: missing accounts or transactions array' };
      }
      this.accounts.clear();
      data.accounts.forEach((acc: Account) => this.accounts.set(acc.id, acc));
      this.transactions = data.transactions;
      this.idempotencyMap.clear();
      if (data.idempotencyMap) {
        Object.entries(data.idempotencyMap).forEach(([k, v]) => this.idempotencyMap.set(k, v as any));
      }
      this.saveState();
      const audit = await this.verifyAuditChain();
      this.emit({
        eventType: 'BURST_COMPLETED',
        updatedAccounts: Array.from(this.accounts.values()),
        timestamp: new Date().toISOString(),
        message: 'Ledger snapshot restored successfully',
      });
      return { success: audit.valid, count: this.transactions.length, error: audit.valid ? undefined : 'Audit chain verification failed on restored snapshot' };
    } catch (e: any) {
      return { success: false, count: 0, error: e.message || 'Failed to parse JSON snapshot' };
    }
  }

  private loadOrSeed() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state: StoredLedgerState = JSON.parse(saved);
        if (state.accounts && state.transactions && state.accounts.length > 0) {
          state.accounts.forEach(a => this.accounts.set(a.id, a));
          this.transactions = state.transactions;
          if (state.idempotencyMap) {
            Object.entries(state.idempotencyMap).forEach(([k, v]) => {
              this.idempotencyMap.set(k, v);
            });
          }
          return;
        }
      }
    } catch {
      // ignore parse errors and seed fresh
    }

    this.seedInstitutionalLedger();
    this.saveState();
  }

  private computeBalances(account: {
    type: AccountType;
    postedDebitsMinor: number;
    postedCreditsMinor: number;
    pendingDebitsMinor: number;
    pendingCreditsMinor: number;
    currency: string;
  }) {
    const isDebitNormal = account.type === 'ASSET' || account.type === 'EXPENSE';
    const postedDebits = BigInt(account.postedDebitsMinor);
    const postedCredits = BigInt(account.postedCreditsMinor);
    const pendingDebits = BigInt(account.pendingDebitsMinor);

    let postedBalanceMinor: bigint;
    let availableBalanceMinor: bigint;
    let pendingBalanceMinor: bigint;

    if (isDebitNormal) {
      postedBalanceMinor = postedDebits - postedCredits;
      pendingBalanceMinor = pendingDebits;
      availableBalanceMinor = postedDebits - postedCredits - pendingDebits;
    } else {
      postedBalanceMinor = postedCredits - postedDebits;
      pendingBalanceMinor = pendingDebits;
      availableBalanceMinor = postedCredits - postedDebits - pendingDebits;
    }

    return {
      postedBalanceMinor: Number(postedBalanceMinor),
      postedBalanceFormatted: formatMinor(postedBalanceMinor, account.currency),
      pendingBalanceMinor: Number(pendingBalanceMinor),
      pendingBalanceFormatted: formatMinor(pendingBalanceMinor, account.currency),
      availableBalanceMinor: Number(availableBalanceMinor),
      availableBalanceFormatted: formatMinor(availableBalanceMinor, account.currency),
      normalBalanceDirection: (isDebitNormal ? 'DEBIT' : 'CREDIT') as Direction,
    };
  }

  private createInternalAccount(
    id: string,
    accountNumber: string,
    currency: string,
    type: AccountType,
    allowNegativeBalance: boolean
  ): Account {
    const initial = {
      type,
      postedDebitsMinor: 0,
      postedCreditsMinor: 0,
      pendingDebitsMinor: 0,
      pendingCreditsMinor: 0,
      currency,
    };
    const balances = this.computeBalances(initial);

    const account: Account = {
      id,
      accountNumber,
      currency,
      type,
      allowNegativeBalance,
      postedDebitsMinor: 0,
      postedCreditsMinor: 0,
      pendingDebitsMinor: 0,
      pendingCreditsMinor: 0,
      ...balances,
      version: 0,
    };
    this.accounts.set(id, account);
    return account;
  }

  // Seed Institutional Chart of Accounts and 25 Transactions
  private seedInstitutionalLedger() {
    const treasury = this.createInternalAccount(crypto.randomUUID(), 'TREASURY-USD-001', 'USD', 'ASSET', true);
    const reserve = this.createInternalAccount(crypto.randomUUID(), 'OPERATING-RESERVE-USD', 'USD', 'ASSET', false);
    const alice = this.createInternalAccount(crypto.randomUUID(), 'CUSTOMER-WALLET-ALICE', 'USD', 'LIABILITY', false);
    const bob = this.createInternalAccount(crypto.randomUUID(), 'CUSTOMER-WALLET-BOB', 'USD', 'LIABILITY', false);
    const stripe = this.createInternalAccount(crypto.randomUUID(), 'MERCHANT-SETTLEMENT-STRIPE', 'USD', 'LIABILITY', false);
    const escrow = this.createInternalAccount(crypto.randomUUID(), 'CARD-HOLD-ESCROW-USD', 'USD', 'LIABILITY', false);
    const feeRevenue = this.createInternalAccount(crypto.randomUUID(), 'FEE-REVENUE-USD', 'USD', 'REVENUE', false);

    // Helper to post balanced
    const postLegs = (idemp: string, desc: string, legs: PostingLegPayload[]) => {
      this.executeTransferInternal({ legs, description: desc }, idemp);
    };

    // Tx 1: Central Treasury Capital Injection to Operating Reserve ($1,000,000.00)
    postLegs('seed-tx-01', 'Treasury capital injection to Operating Reserve ($1,000,000.00)', [
      { accountId: treasury.id, amountMinor: 100_000_000, direction: 'CREDIT' },
      { accountId: reserve.id, amountMinor: 100_000_000, direction: 'DEBIT' },
    ]);

    // Tx 2: Customer Deposit Alice ($50,000.00)
    postLegs('seed-tx-02', 'Initial customer deposit Alice ($50,000.00)', [
      { accountId: treasury.id, amountMinor: 5_000_000, direction: 'DEBIT' },
      { accountId: alice.id, amountMinor: 5_000_000, direction: 'CREDIT' },
    ]);

    // Tx 3: Customer Deposit Bob ($50,000.00)
    postLegs('seed-tx-03', 'Initial customer deposit Bob ($50,000.00)', [
      { accountId: treasury.id, amountMinor: 5_000_000, direction: 'DEBIT' },
      { accountId: bob.id, amountMinor: 5_000_000, direction: 'CREDIT' },
    ]);

    // Tx 4: Merchant Settlement Float Stripe ($100,000.00)
    postLegs('seed-tx-04', 'Merchant settlement liquidity float Stripe ($100,000.00)', [
      { accountId: treasury.id, amountMinor: 10_000_000, direction: 'DEBIT' },
      { accountId: stripe.id, amountMinor: 10_000_000, direction: 'CREDIT' },
    ]);

    // Tx 5 - 14: Purchases with Fee Revenue Splits
    const purchases = [
      [15_000, 14_550, 450],
      [20_000, 19_400, 600],
      [5_000, 4_850, 150],
      [7_500, 7_275, 225],
      [30_000, 29_100, 900],
      [12_000, 11_640, 360],
      [8_500, 8_245, 255],
      [4_500, 4_365, 135],
      [22_000, 21_340, 660],
      [9_500, 9_215, 285],
    ];

    for (let i = 0; i < purchases.length; i++) {
      const num = 5 + i;
      const buyerId = (i % 2 === 0) ? alice.id : bob.id;
      const buyerName = (i % 2 === 0) ? 'Alice' : 'Bob';
      const [total, merchantShare, feeShare] = purchases[i];

      postLegs(`seed-tx-${String(num).padStart(2, '0')}`, `Card Checkout ${buyerName} -> Stripe (Fee: $${(feeShare / 100).toFixed(2)})`, [
        { accountId: buyerId, amountMinor: total, direction: 'DEBIT' },
        { accountId: stripe.id, amountMinor: merchantShare, direction: 'CREDIT' },
        { accountId: feeRevenue.id, amountMinor: feeShare, direction: 'CREDIT' },
      ]);
    }

    // Tx 15 - 18: P2P Transfers
    postLegs('seed-tx-15', 'P2P transfer Alice -> Bob ($50.00)', [
      { accountId: alice.id, amountMinor: 5_000, direction: 'DEBIT' },
      { accountId: bob.id, amountMinor: 5_000, direction: 'CREDIT' },
    ]);
    postLegs('seed-tx-16', 'P2P transfer Bob -> Alice ($25.00)', [
      { accountId: bob.id, amountMinor: 2_500, direction: 'DEBIT' },
      { accountId: alice.id, amountMinor: 2_500, direction: 'CREDIT' },
    ]);
    postLegs('seed-tx-17', 'P2P transfer Alice -> Bob ($100.00)', [
      { accountId: alice.id, amountMinor: 10_000, direction: 'DEBIT' },
      { accountId: bob.id, amountMinor: 10_000, direction: 'CREDIT' },
    ]);
    postLegs('seed-tx-18', 'P2P transfer Bob -> Alice ($40.00)', [
      { accountId: bob.id, amountMinor: 4_000, direction: 'DEBIT' },
      { accountId: alice.id, amountMinor: 4_000, direction: 'CREDIT' },
    ]);

    // Tx 19: Card Hold Alice ($65.00)
    const hold1 = this.authorizeHoldInternal({
      sourceAccountId: alice.id,
      destinationAccountId: escrow.id,
      amountMinor: 6_500,
      description: 'Uber Ride Pre-Authorization',
    }, 'seed-tx-19');

    // Tx 20: Card Hold Bob ($120.00)
    const hold2 = this.authorizeHoldInternal({
      sourceAccountId: bob.id,
      destinationAccountId: escrow.id,
      amountMinor: 12_000,
      description: 'Hotel Security Deposit Hold',
    }, 'seed-tx-20');

    // Tx 21: Card Hold Alice ($45.00)
    const hold3 = this.authorizeHoldInternal({
      sourceAccountId: alice.id,
      destinationAccountId: escrow.id,
      amountMinor: 4_500,
      description: 'Gas Pump Pre-Authorization',
    }, 'seed-tx-21');

    // Settle Hold 1 (Transitions Tx 19 to POSTED)
    this.settleHoldInternal(hold1.id, 'seed-tx-19-settle');

    // Settle Hold 2 (Transitions Tx 20 to POSTED)
    this.settleHoldInternal(hold2.id, 'seed-tx-20-settle');

    // Void Hold 3 (Transitions Tx 21 to VOIDED)
    this.voidHoldInternal(hold3.id, 'seed-tx-21-void');

    // Tx 22: Merchant Payout Sweep
    postLegs('seed-tx-22', 'Merchant daily payout sweep: Stripe -> Treasury ($500.00)', [
      { accountId: stripe.id, amountMinor: 50_000, direction: 'DEBIT' },
      { accountId: treasury.id, amountMinor: 50_000, direction: 'CREDIT' },
    ]);

    // Tx 23: Treasury Interest Accrual
    postLegs('seed-tx-23', 'Treasury overnight yield accrual to Operating Reserve ($150.00)', [
      { accountId: treasury.id, amountMinor: 15_000, direction: 'DEBIT' },
      { accountId: reserve.id, amountMinor: 15_000, direction: 'CREDIT' },
    ]);

    // Tx 24: ATM Cash Dispense & Network Fee
    postLegs('seed-tx-24', 'ATM cash withdrawal: Bob ($200.00)', [
      { accountId: bob.id, amountMinor: 20_000, direction: 'DEBIT' },
      { accountId: treasury.id, amountMinor: 20_000, direction: 'CREDIT' },
    ]);

    // Tx 25: Operating Reserve to Treasury Liquidity Sweep ($100.00)
    postLegs('seed-tx-25', 'Operating Reserve to Treasury Liquidity Sweep ($100.00)', [
      { accountId: reserve.id, amountMinor: 10_000, direction: 'CREDIT' },
      { accountId: treasury.id, amountMinor: 10_000, direction: 'DEBIT' },
    ]);
  }

  // Public API methods matching REST API Gateway

  public async getAccounts(): Promise<Account[]> {
    return Array.from(this.accounts.values());
  }

  public async getAccount(id: string): Promise<Account> {
    const acc = this.accounts.get(id);
    if (!acc) throw new Error(`Account not found: ${id}`);
    return acc;
  }

  public async createAccount(payload: CreateAccountPayload): Promise<Account> {
    const id = crypto.randomUUID();
    const created = this.createInternalAccount(
      id,
      payload.accountNumber,
      payload.currency,
      payload.type,
      payload.allowNegativeBalance
    );
    this.saveState();
    this.emit({
      eventType: 'BALANCE_UPDATED',
      updatedAccounts: [created],
      timestamp: new Date().toISOString(),
    });
    return created;
  }

  public async getTransactions(limit: number = 100, afterSequence: number = 0): Promise<Transaction[]> {
    let result = this.transactions;
    if (afterSequence > 0) {
      result = result.filter(t => t.sequenceNum > afterSequence);
    }
    return result.slice(0, limit);
  }

  public async getTransaction(id: string): Promise<Transaction> {
    const tx = this.transactions.find(t => t.id === id);
    if (!tx) throw new Error(`Transaction not found: ${id}`);
    return tx;
  }

  public async executeTransfer(
    payload: CreateTransferPayload,
    idempotencyKey: string
  ): Promise<{ transaction: Transaction; status: number }> {
    const res = this.executeTransferInternal(payload, idempotencyKey);
    this.saveState();
    return res;
  }

  public async authorizeHold(
    payload: CreateHoldPayload,
    idempotencyKey: string
  ): Promise<{ transaction: Transaction; status: number }> {
    const tx = this.authorizeHoldInternal(payload, idempotencyKey);
    this.saveState();
    return { transaction: tx, status: 201 };
  }

  public async settleHold(transactionId: string, idempotencyKey: string): Promise<Transaction> {
    const tx = this.settleHoldInternal(transactionId, idempotencyKey);
    this.saveState();
    return tx;
  }

  public async voidHold(transactionId: string, idempotencyKey: string): Promise<Transaction> {
    const tx = this.voidHoldInternal(transactionId, idempotencyKey);
    this.saveState();
    return tx;
  }

  public async verifyAuditChain(): Promise<AuditReport> {
    const start = performance.now();
    const txs = [...this.transactions].sort((a, b) => a.sequenceNum - b.sequenceNum);

    let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';
    let corruptedSeq: number | null = null;
    let failureReason: string | null = null;

    const blockHashes: string[] = [];

    for (const tx of txs) {
      if (tx.prevHash !== prevHash) {
        corruptedSeq = tx.sequenceNum;
        failureReason = `Broken prevHash at sequence ${tx.sequenceNum}`;
        break;
      }

      // Recompute canonical hash
      const canonicalLegs = [...tx.postings]
        .sort((a, b) => a.sequenceIndex - b.sequenceIndex)
        .map(p => `${p.sequenceIndex}:${p.accountId}:${p.amountMinor}:${p.direction}`)
        .join(';');

      const expectedPayload = `${tx.prevHash}|${tx.id}|${tx.idempotencyKey}|${tx.status}|${canonicalLegs}`;
      const recomputedHash = sha256(expectedPayload);

      // In case hold was settled/voided in place, status in hash is either current status or PENDING
      const pendingPayload = `${tx.prevHash}|${tx.id}|${tx.idempotencyKey}|PENDING|${canonicalLegs}`;
      const pendingHash = sha256(pendingPayload);

      if (tx.hash !== recomputedHash && tx.hash !== pendingHash) {
        corruptedSeq = tx.sequenceNum;
        failureReason = `Hash mismatch at sequence ${tx.sequenceNum}`;
        break;
      }

      prevHash = tx.hash;
      blockHashes.push(tx.hash);
    }

    const elapsed = Math.max(1, Math.round(performance.now() - start));
    const merkleRoot = computeMerkleRoot(blockHashes);

    return {
      valid: corruptedSeq === null,
      totalTransactionsScanned: txs.length,
      genesisHash: txs[0]?.hash || '0000000000000000000000000000000000000000000000000000000000000000',
      latestHash: txs[txs.length - 1]?.hash || '0000000000000000000000000000000000000000000000000000000000000000',
      merkleRoot,
      verifiedAt: new Date().toISOString(),
      executionTimeMs: elapsed,
      corruptedSequenceNum: corruptedSeq,
      failureReason,
    };
  }

  public async triggerBurst(payload: BurstSimulationPayload): Promise<BurstSimulationResponse> {
    const start = performance.now();
    const accountsList = Array.from(this.accounts.values()).filter(a => a.accountNumber.startsWith('CUSTOMER-') || a.accountNumber.startsWith('MERCHANT-'));
    if (accountsList.length < 2) {
      throw new Error('Not enough accounts to run burst simulation');
    }

    let success = 0;
    let failed = 0;
    let totalMinor = 0n;

    const count = payload.burstSize || 500;
    const amount = payload.amountPerTransferMinor || 1000;

    for (let i = 0; i < count; i++) {
      try {
        const src = accountsList[i % accountsList.length];
        const dst = accountsList[(i + 1) % accountsList.length];
        const idemp = `burst-standalone-${Date.now()}-${i}`;

        this.executeTransferInternal({
          sourceAccountId: src.id,
          destinationAccountId: dst.id,
          amountMinor: amount,
          description: `Standalone Burst Transfer #${i + 1}`,
        }, idemp);

        success++;
        totalMinor += BigInt(amount);
      } catch {
        failed++;
      }
    }

    this.saveState();
    const elapsed = Math.max(1, Math.round(performance.now() - start));
    const tps = (success / (elapsed / 1000));

    this.emit({
      eventType: 'BURST_COMPLETED',
      timestamp: new Date().toISOString(),
      message: `Completed ${success} transfers`,
    });

    return {
      status: 'COMPLETED',
      successfulTransfers: success,
      failedTransfers: failed,
      totalAmountTransferredMinor: Number(totalMinor),
      totalAmountTransferredFormatted: formatMinor(totalMinor),
      elapsedMilliseconds: elapsed,
      effectiveThroughputTps: tps,
    };
  }

  // Core accounting logic implementation

  private executeTransferInternal(
    payload: CreateTransferPayload,
    idempotencyKey: string
  ): { transaction: Transaction; status: number } {
    let rawLegs: PostingLegPayload[] = [];

    if (payload.legs && payload.legs.length > 0) {
      rawLegs = payload.legs;
    } else if (payload.sourceAccountId && payload.destinationAccountId && payload.amountMinor) {
      const src = this.accounts.get(payload.sourceAccountId);
      const dst = this.accounts.get(payload.destinationAccountId);
      if (!src) throw new Error(`Source account not found: ${payload.sourceAccountId}`);
      if (!dst) throw new Error(`Destination account not found: ${payload.destinationAccountId}`);

      const srcDir: Direction = (src.type === 'ASSET' || src.type === 'EXPENSE') ? 'CREDIT' : 'DEBIT';
      const dstDir: Direction = (srcDir === 'CREDIT') ? 'DEBIT' : 'CREDIT';

      rawLegs = [
        { accountId: src.id, amountMinor: payload.amountMinor, direction: srcDir },
        { accountId: dst.id, amountMinor: payload.amountMinor, direction: dstDir },
      ];
    } else {
      throw new Error('Invalid transfer payload');
    }

    // Invariant 1: At least 2 legs
    if (rawLegs.length < 2) {
      throw new Error('Transaction must contain at least 2 posting legs');
    }

    // Invariant 2: Double-Entry Sum(DEBITS) === Sum(CREDITS)
    const balanceCheck = calculateLegsBalance(rawLegs);
    if (!balanceCheck.isBalanced) {
      throw new Error(`Unbalanced transaction legs: Discrepancy ${balanceCheck.diffFormatted}`);
    }

    // Canonical payload hash for idempotency checking
    const canonicalPayload = rawLegs
      .map((l, i) => `${i}:${l.accountId}:${l.amountMinor}:${l.direction}`)
      .join(';');
    const payloadHash = sha256(canonicalPayload + '|' + payload.description);

    // Idempotency Defense
    const existing = this.idempotencyMap.get(idempotencyKey);
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new Error(`Idempotency conflict: Key "${idempotencyKey}" already processed with different parameters.`);
      }
      const cached = this.transactions.find(t => t.id === existing.transactionId);
      if (cached) {
        return { transaction: cached, status: 200 };
      }
    }

    // Verify funds & calculate balances
    const updatedAccountsList: Account[] = [];

    for (const leg of rawLegs) {
      const acc = this.accounts.get(leg.accountId);
      if (!acc) throw new Error(`Account not found: ${leg.accountId}`);

      const amt = BigInt(leg.amountMinor);
      if (amt <= 0n) throw new Error('Leg amount must be strictly > 0');

      let newPostedDebits = BigInt(acc.postedDebitsMinor);
      let newPostedCredits = BigInt(acc.postedCreditsMinor);

      if (leg.direction === 'DEBIT') {
        newPostedDebits += amt;
      } else {
        newPostedCredits += amt;
      }

      const isDebitNormal = acc.type === 'ASSET' || acc.type === 'EXPENSE';
      let available: bigint;
      if (isDebitNormal) {
        available = newPostedDebits - newPostedCredits - BigInt(acc.pendingDebitsMinor);
      } else {
        available = newPostedCredits - newPostedDebits - BigInt(acc.pendingDebitsMinor);
      }

      if (!acc.allowNegativeBalance && available < 0n) {
        throw new Error(`Insufficient funds on account ${acc.accountNumber}: attempted ${formatMinor(amt)}, available ${formatMinor(acc.availableBalanceMinor)}`);
      }

      const bal = this.computeBalances({
        type: acc.type,
        postedDebitsMinor: Number(newPostedDebits),
        postedCreditsMinor: Number(newPostedCredits),
        pendingDebitsMinor: acc.pendingDebitsMinor,
        pendingCreditsMinor: acc.pendingCreditsMinor,
        currency: acc.currency,
      });

      const updatedAcc: Account = {
        ...acc,
        postedDebitsMinor: Number(newPostedDebits),
        postedCreditsMinor: Number(newPostedCredits),
        ...bal,
        version: acc.version + 1,
      };
      this.accounts.set(acc.id, updatedAcc);
      updatedAccountsList.push(updatedAcc);
    }

    // Build Transaction & Hash Chain
    const txId = crypto.randomUUID();
    const seq = this.transactions.length + 1;
    const prevHash = this.transactions.length > 0
      ? this.transactions[0].hash
      : '0000000000000000000000000000000000000000000000000000000000000000';

    const postings: Posting[] = rawLegs.map((l, idx) => {
      const acc = this.accounts.get(l.accountId)!;
      return {
        id: crypto.randomUUID(),
        transactionId: txId,
        accountId: l.accountId,
        accountNumber: acc.accountNumber,
        currency: acc.currency,
        amountMinor: l.amountMinor,
        amountFormatted: formatMinor(l.amountMinor, acc.currency),
        direction: l.direction,
        sequenceIndex: idx,
      };
    });

    const canonicalLegs = postings
      .map(p => `${p.sequenceIndex}:${p.accountId}:${p.amountMinor}:${p.direction}`)
      .join(';');
    const hash = sha256(`${prevHash}|${txId}|${idempotencyKey}|POSTED|${canonicalLegs}`);

    const tx: Transaction = {
      sequenceNum: seq,
      id: txId,
      idempotencyKey,
      description: payload.description,
      status: 'POSTED',
      postedAt: new Date().toISOString(),
      totalAmountMinor: Number(balanceCheck.totalDebitsMinor),
      totalAmountFormatted: formatMinor(balanceCheck.totalDebitsMinor),
      prevHash,
      hash,
      postings,
    };

    this.transactions.unshift(tx);
    this.idempotencyMap.set(idempotencyKey, { payloadHash, transactionId: txId });

    this.emit({
      eventType: 'TRANSACTION_POSTED',
      transaction: tx,
      updatedAccounts: updatedAccountsList,
      timestamp: tx.postedAt,
    });

    return { transaction: tx, status: 201 };
  }

  private authorizeHoldInternal(payload: CreateHoldPayload, idempotencyKey: string): Transaction {
    const src = this.accounts.get(payload.sourceAccountId);
    const dst = this.accounts.get(payload.destinationAccountId);
    if (!src) throw new Error(`Source account not found: ${payload.sourceAccountId}`);
    if (!dst) throw new Error(`Destination account not found: ${payload.destinationAccountId}`);

    const amt = BigInt(payload.amountMinor);
    if (amt <= 0n) throw new Error('Hold amount must be > 0');

    // Check available balance
    if (!src.allowNegativeBalance && BigInt(src.availableBalanceMinor) < amt) {
      throw new Error(`Insufficient funds for hold: available ${formatMinor(src.availableBalanceMinor)}, attempted ${formatMinor(amt)}`);
    }

    const newPendingDebits = src.pendingDebitsMinor + payload.amountMinor;
    const balances = this.computeBalances({
      type: src.type,
      postedDebitsMinor: src.postedDebitsMinor,
      postedCreditsMinor: src.postedCreditsMinor,
      pendingDebitsMinor: newPendingDebits,
      pendingCreditsMinor: src.pendingCreditsMinor,
      currency: src.currency,
    });

    const updatedSrc: Account = {
      ...src,
      pendingDebitsMinor: newPendingDebits,
      ...balances,
      version: src.version + 1,
    };
    this.accounts.set(src.id, updatedSrc);

    const txId = crypto.randomUUID();
    const seq = this.transactions.length + 1;
    const prevHash = this.transactions.length > 0 ? this.transactions[0].hash : '0000000000000000000000000000000000000000000000000000000000000000';

    const postings: Posting[] = [
      {
        id: crypto.randomUUID(),
        transactionId: txId,
        accountId: src.id,
        accountNumber: src.accountNumber,
        currency: src.currency,
        amountMinor: payload.amountMinor,
        amountFormatted: formatMinor(payload.amountMinor, src.currency),
        direction: 'DEBIT',
        sequenceIndex: 0,
      },
      {
        id: crypto.randomUUID(),
        transactionId: txId,
        accountId: dst.id,
        accountNumber: dst.accountNumber,
        currency: dst.currency,
        amountMinor: payload.amountMinor,
        amountFormatted: formatMinor(payload.amountMinor, dst.currency),
        direction: 'CREDIT',
        sequenceIndex: 1,
      },
    ];

    const canonicalLegs = postings.map(p => `${p.sequenceIndex}:${p.accountId}:${p.amountMinor}:${p.direction}`).join(';');
    const hash = sha256(`${prevHash}|${txId}|${idempotencyKey}|PENDING|${canonicalLegs}`);

    const tx: Transaction = {
      sequenceNum: seq,
      id: txId,
      idempotencyKey,
      description: payload.description,
      status: 'PENDING',
      postedAt: new Date().toISOString(),
      totalAmountMinor: payload.amountMinor,
      totalAmountFormatted: formatMinor(payload.amountMinor),
      prevHash,
      hash,
      postings,
    };

    this.transactions.unshift(tx);
    this.idempotencyMap.set(idempotencyKey, { payloadHash: hash, transactionId: txId });

    this.emit({
      eventType: 'HOLD_AUTHORIZED',
      transaction: tx,
      updatedAccounts: [updatedSrc],
      timestamp: tx.postedAt,
    });

    return tx;
  }

  private settleHoldInternal(transactionId: string, _idempotencyKey: string): Transaction {
    const txIndex = this.transactions.findIndex(t => t.id === transactionId);
    if (txIndex < 0) throw new Error(`Hold transaction not found: ${transactionId}`);
    const holdTx = this.transactions[txIndex];
    if (holdTx.status !== 'PENDING') {
      throw new Error(`Hold already settled or voided: ${holdTx.status}`);
    }

    const srcPosting = holdTx.postings.find(p => p.direction === 'DEBIT')!;
    const dstPosting = holdTx.postings.find(p => p.direction === 'CREDIT')!;

    const src = this.accounts.get(srcPosting.accountId)!;
    const dst = this.accounts.get(dstPosting.accountId)!;

    // Release pending hold on source and convert to posted debit/credit
    const updatedSrcPendingDebits = Math.max(0, src.pendingDebitsMinor - srcPosting.amountMinor);
    const updatedSrcPosted = (src.type === 'ASSET' || src.type === 'EXPENSE')
      ? src.postedCreditsMinor + srcPosting.amountMinor
      : src.postedDebitsMinor + srcPosting.amountMinor;

    const srcBalances = this.computeBalances({
      type: src.type,
      postedDebitsMinor: (src.type === 'ASSET' || src.type === 'EXPENSE') ? src.postedDebitsMinor : updatedSrcPosted,
      postedCreditsMinor: (src.type === 'ASSET' || src.type === 'EXPENSE') ? updatedSrcPosted : src.postedCreditsMinor,
      pendingDebitsMinor: updatedSrcPendingDebits,
      pendingCreditsMinor: src.pendingCreditsMinor,
      currency: src.currency,
    });

    const newSrc: Account = {
      ...src,
      postedDebitsMinor: (src.type === 'ASSET' || src.type === 'EXPENSE') ? src.postedDebitsMinor : updatedSrcPosted,
      postedCreditsMinor: (src.type === 'ASSET' || src.type === 'EXPENSE') ? updatedSrcPosted : src.postedCreditsMinor,
      pendingDebitsMinor: updatedSrcPendingDebits,
      ...srcBalances,
      version: src.version + 1,
    };
    this.accounts.set(src.id, newSrc);

    // Credit destination
    const dstNewPosted = (dst.type === 'ASSET' || dst.type === 'EXPENSE')
      ? dst.postedDebitsMinor + dstPosting.amountMinor
      : dst.postedCreditsMinor + dstPosting.amountMinor;

    const dstBalances = this.computeBalances({
      type: dst.type,
      postedDebitsMinor: (dst.type === 'ASSET' || dst.type === 'EXPENSE') ? dstNewPosted : dst.postedDebitsMinor,
      postedCreditsMinor: (dst.type === 'ASSET' || dst.type === 'EXPENSE') ? dst.postedCreditsMinor : dstNewPosted,
      pendingDebitsMinor: dst.pendingDebitsMinor,
      pendingCreditsMinor: dst.pendingCreditsMinor,
      currency: dst.currency,
    });

    const newDst: Account = {
      ...dst,
      postedDebitsMinor: (dst.type === 'ASSET' || dst.type === 'EXPENSE') ? dstNewPosted : dst.postedDebitsMinor,
      postedCreditsMinor: (dst.type === 'ASSET' || dst.type === 'EXPENSE') ? dst.postedCreditsMinor : dstNewPosted,
      ...dstBalances,
      version: dst.version + 1,
    };
    this.accounts.set(dst.id, newDst);

    // Update status to POSTED
    const updatedTx: Transaction = {
      ...holdTx,
      status: 'POSTED',
    };
    this.transactions[txIndex] = updatedTx;

    this.emit({
      eventType: 'HOLD_SETTLED',
      transaction: updatedTx,
      updatedAccounts: [newSrc, newDst],
      timestamp: new Date().toISOString(),
    });

    return updatedTx;
  }

  private voidHoldInternal(transactionId: string, _idempotencyKey: string): Transaction {
    const txIndex = this.transactions.findIndex(t => t.id === transactionId);
    if (txIndex < 0) throw new Error(`Hold transaction not found: ${transactionId}`);
    const holdTx = this.transactions[txIndex];
    if (holdTx.status !== 'PENDING') {
      throw new Error(`Hold already finalized: ${holdTx.status}`);
    }

    const srcPosting = holdTx.postings.find(p => p.direction === 'DEBIT')!;
    const src = this.accounts.get(srcPosting.accountId)!;

    // Release pending hold without modifying posted debits/credits
    const updatedPendingDebits = Math.max(0, src.pendingDebitsMinor - srcPosting.amountMinor);
    const balances = this.computeBalances({
      type: src.type,
      postedDebitsMinor: src.postedDebitsMinor,
      postedCreditsMinor: src.postedCreditsMinor,
      pendingDebitsMinor: updatedPendingDebits,
      pendingCreditsMinor: src.pendingCreditsMinor,
      currency: src.currency,
    });

    const newSrc: Account = {
      ...src,
      pendingDebitsMinor: updatedPendingDebits,
      ...balances,
      version: src.version + 1,
    };
    this.accounts.set(src.id, newSrc);

    const updatedTx: Transaction = {
      ...holdTx,
      status: 'VOIDED',
    };
    this.transactions[txIndex] = updatedTx;

    this.emit({
      eventType: 'HOLD_VOIDED',
      transaction: updatedTx,
      updatedAccounts: [newSrc],
      timestamp: new Date().toISOString(),
    });

    return updatedTx;
  }
}

export const standaloneKernel = new EmbeddedLedgerKernel();
