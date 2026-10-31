import type {
  Account,
  AccountStatement,
  AuditReport,
  BurstSimulationPayload,
  BurstSimulationResponse,
  CreateAccountPayload,
  CreateHoldPayload,
  CreateTransferPayload,
  StreamEvent,
  Transaction,
} from '../types/ledger';
import { LedgerApi, globalStream, type StreamConnectionStatus } from '../services/api';
import { standaloneKernel } from '../engine/EmbeddedLedgerKernel';

export type EngineMode = 'JAVA_21_BACKEND' | 'EMBEDDED_KERNEL';

class SmartTransportRouter {
  private mode: EngineMode = 'EMBEDDED_KERNEL';
  private modeListeners: ((mode: EngineMode) => void)[] = [];
  private eventListeners: ((event: StreamEvent) => void)[] = [];
  private statusListeners: ((status: StreamConnectionStatus) => void)[] = [];

  constructor() {
    this.wireListeners();
  }

  private wireListeners() {
    // Wire live SSE stream
    globalStream.onEvent((evt) => {
      if (this.mode === 'JAVA_21_BACKEND') {
        this.notifyEvents(evt);
      }
    });

    globalStream.onStatusChange((status) => {
      if (this.mode === 'JAVA_21_BACKEND') {
        this.notifyStatus(status);
      }
    });

    // Wire standalone kernel stream
    standaloneKernel.onEvent((evt) => {
      if (this.mode === 'EMBEDDED_KERNEL') {
        this.notifyEvents(evt);
      }
    });
  }

  public async autoDetectMode(): Promise<EngineMode> {
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
      this.setMode('EMBEDDED_KERNEL');
      this.notifyStatus('CONNECTED');
      return 'EMBEDDED_KERNEL';
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 400);
      const res = await fetch('/api/v1/accounts', { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        this.setMode('JAVA_21_BACKEND');
        globalStream.connect();
      } else {
        this.setMode('EMBEDDED_KERNEL');
        this.notifyStatus('CONNECTED');
      }
    } catch {
      this.setMode('EMBEDDED_KERNEL');
      this.notifyStatus('CONNECTED');
    }

    return this.mode;
  }

  public getMode(): EngineMode {
    return this.mode;
  }

  public setMode(mode: EngineMode): void {
    this.mode = mode;
    this.modeListeners.forEach(l => l(mode));
    if (mode === 'JAVA_21_BACKEND') {
      globalStream.connect();
    } else {
      globalStream.disconnect();
      this.notifyStatus('CONNECTED');
    }
  }

  public toggleMode(): EngineMode {
    const next = this.mode === 'JAVA_21_BACKEND' ? 'EMBEDDED_KERNEL' : 'JAVA_21_BACKEND';
    this.setMode(next);
    return next;
  }

  public onModeChange(callback: (mode: EngineMode) => void): () => void {
    this.modeListeners.push(callback);
    callback(this.mode);
    return () => {
      this.modeListeners = this.modeListeners.filter(l => l !== callback);
    };
  }

  public onEvent(callback: (event: StreamEvent) => void): () => void {
    this.eventListeners.push(callback);
    return () => {
      this.eventListeners = this.eventListeners.filter(l => l !== callback);
    };
  }

  public onStatusChange(callback: (status: StreamConnectionStatus) => void): () => void {
    this.statusListeners.push(callback);
    callback(this.mode === 'JAVA_21_BACKEND' ? 'CONNECTING' : 'CONNECTED');
    return () => {
      this.statusListeners = this.statusListeners.filter(l => l !== callback);
    };
  }

  private notifyEvents(event: StreamEvent) {
    this.eventListeners.forEach(l => l(event));
  }

  private notifyStatus(status: StreamConnectionStatus) {
    this.statusListeners.forEach(l => l(status));
  }

  // Unified API Methods

  public async getAccounts(): Promise<Account[]> {
    if (this.mode === 'JAVA_21_BACKEND') {
      return LedgerApi.getAccounts();
    }
    return standaloneKernel.getAccounts();
  }

  public async getAccount(id: string): Promise<Account> {
    if (this.mode === 'JAVA_21_BACKEND') {
      return LedgerApi.getAccount(id);
    }
    return standaloneKernel.getAccount(id);
  }

  public async getAccountStatement(id: string, page: number = 1, pageSize: number = 50): Promise<AccountStatement> {
    if (this.mode === 'JAVA_21_BACKEND') {
      return LedgerApi.getAccountStatement(id, page, pageSize);
    }
    // Statement generation for standalone kernel
    const acc = await standaloneKernel.getAccount(id);
    const txs = await standaloneKernel.getTransactions(1000, 0);

    const entries: any[] = [];
    let running = 0;
    const isDebitNormal = acc.type === 'ASSET' || acc.type === 'EXPENSE';

    const accountTxs = txs
      .filter(t => t.postings.some(p => p.accountId === id))
      .sort((a, b) => a.sequenceNum - b.sequenceNum);

    for (const t of accountTxs) {
      for (const p of t.postings.filter(p => p.accountId === id)) {
        if (p.direction === (isDebitNormal ? 'DEBIT' : 'CREDIT')) {
          running += p.amountMinor;
        } else {
          running -= p.amountMinor;
        }
        entries.push({
          sequenceNum: t.sequenceNum,
          transactionId: t.id,
          idempotencyKey: t.idempotencyKey,
          description: t.description,
          status: t.status,
          postedAt: t.postedAt,
          postingId: p.id,
          direction: p.direction,
          amountMinor: p.amountMinor,
          amountFormatted: p.amountFormatted,
          runningBalanceMinor: running,
          runningBalanceFormatted: p.amountFormatted,
        });
      }
    }

    const offset = (page - 1) * pageSize;
    const paginated = entries.slice(offset, offset + pageSize);

    return {
      account: acc,
      page,
      pageSize,
      totalEntries: entries.length,
      entries: paginated,
    };
  }

  public async createAccount(payload: CreateAccountPayload): Promise<Account> {
    if (this.mode === 'JAVA_21_BACKEND') {
      return LedgerApi.createAccount(payload);
    }
    return standaloneKernel.createAccount(payload);
  }

  public async getTransactions(limit: number = 100, afterSequence: number = 0): Promise<Transaction[]> {
    if (this.mode === 'JAVA_21_BACKEND') {
      return LedgerApi.getTransactions(limit, afterSequence);
    }
    return standaloneKernel.getTransactions(limit, afterSequence);
  }

  public async getTransaction(id: string): Promise<Transaction> {
    if (this.mode === 'JAVA_21_BACKEND') {
      return LedgerApi.getTransaction(id);
    }
    return standaloneKernel.getTransaction(id);
  }

  public async executeTransfer(
    payload: CreateTransferPayload,
    idempotencyKey: string
  ): Promise<{ transaction: Transaction; status: number }> {
    if (this.mode === 'JAVA_21_BACKEND') {
      return LedgerApi.executeTransfer(payload, idempotencyKey);
    }
    return standaloneKernel.executeTransfer(payload, idempotencyKey);
  }

  public async authorizeHold(
    payload: CreateHoldPayload,
    idempotencyKey: string
  ): Promise<{ transaction: Transaction; status: number }> {
    if (this.mode === 'JAVA_21_BACKEND') {
      return LedgerApi.authorizeHold(payload, idempotencyKey);
    }
    return standaloneKernel.authorizeHold(payload, idempotencyKey);
  }

  public async settleHold(transactionId: string, idempotencyKey: string): Promise<Transaction> {
    if (this.mode === 'JAVA_21_BACKEND') {
      return LedgerApi.settleHold(transactionId, idempotencyKey);
    }
    return standaloneKernel.settleHold(transactionId, idempotencyKey);
  }

  public async voidHold(transactionId: string, idempotencyKey: string): Promise<Transaction> {
    if (this.mode === 'JAVA_21_BACKEND') {
      return LedgerApi.voidHold(transactionId, idempotencyKey);
    }
    return standaloneKernel.voidHold(transactionId, idempotencyKey);
  }

  public async verifyAuditChain(): Promise<AuditReport> {
    if (this.mode === 'JAVA_21_BACKEND') {
      return LedgerApi.verifyAuditChain();
    }
    return standaloneKernel.verifyAuditChain();
  }

  public async triggerBurst(payload: BurstSimulationPayload): Promise<BurstSimulationResponse> {
    if (this.mode === 'JAVA_21_BACKEND') {
      return LedgerApi.triggerBurst(payload);
    }
    return standaloneKernel.triggerBurst(payload);
  }

  public resetStandaloneState(): void {
    standaloneKernel.resetState();
  }

  public async exportSnapshot(): Promise<string> {
    if (this.mode === 'JAVA_21_BACKEND') {
      const [accs, txs, audit] = await Promise.all([
        LedgerApi.getAccounts(),
        LedgerApi.getTransactions(10000, 0),
        LedgerApi.verifyAuditChain(),
      ]);
      const data = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        merkleRoot: audit.merkleRoot,
        totalTransactions: txs.length,
        accounts: accs,
        transactions: txs,
      };
      return JSON.stringify(data, null, 2);
    }
    return standaloneKernel.exportSnapshot();
  }

  public async importSnapshot(jsonStr: string): Promise<{ success: boolean; count: number; error?: string }> {
    return standaloneKernel.importSnapshot(jsonStr);
  }

  public async pingGateway(targetUrl: string): Promise<{ ok: boolean; latencyMs: number; statusText: string }> {
    const start = performance.now();
    try {
      const url = targetUrl.replace(/\/$/, '') + '/api/v1/accounts';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      const latencyMs = Math.round(performance.now() - start);
      return { ok: res.ok, latencyMs, statusText: `${res.status} ${res.statusText}` };
    } catch (e: any) {
      const latencyMs = Math.round(performance.now() - start);
      return { ok: false, latencyMs, statusText: e.name === 'AbortError' ? 'TIMEOUT (1500ms)' : 'CONNECTION REFUSED' };
    }
  }
}

export const ledgerClient = new SmartTransportRouter();
