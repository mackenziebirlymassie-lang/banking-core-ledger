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

const API_BASE = '/api/v1';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `HTTP ${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data.detail) {
        errorDetail = data.detail;
      } else if (data.title) {
        errorDetail = `${data.title}: ${data.detail || ''}`;
      } else if (data.message) {
        errorDetail = data.message;
      }
    } catch {
      // response wasn't JSON
    }
    throw new Error(errorDetail);
  }
  return res.json() as Promise<T>;
}

export const LedgerApi = {
  async getAccounts(): Promise<Account[]> {
    const res = await fetch(`${API_BASE}/accounts`);
    return handleResponse<Account[]>(res);
  },

  async getAccount(id: string): Promise<Account> {
    const res = await fetch(`${API_BASE}/accounts/${encodeURIComponent(id)}`);
    return handleResponse<Account>(res);
  },

  async getAccountStatement(id: string, page: number = 1, pageSize: number = 50): Promise<AccountStatement> {
    const res = await fetch(`${API_BASE}/accounts/${encodeURIComponent(id)}/statement?page=${page}&pageSize=${pageSize}`);
    return handleResponse<AccountStatement>(res);
  },

  async createAccount(payload: CreateAccountPayload): Promise<Account> {
    const res = await fetch(`${API_BASE}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<Account>(res);
  },

  async getTransactions(limit: number = 100, afterSequence: number = 0): Promise<Transaction[]> {
    const res = await fetch(`${API_BASE}/transactions?limit=${limit}&afterSequence=${afterSequence}`);
    return handleResponse<Transaction[]>(res);
  },

  async getTransaction(id: string): Promise<Transaction> {
    const res = await fetch(`${API_BASE}/transactions/${encodeURIComponent(id)}`);
    return handleResponse<Transaction>(res);
  },

  async executeTransfer(payload: CreateTransferPayload, idempotencyKey: string): Promise<{ transaction: Transaction; status: number }> {
    const res = await fetch(`${API_BASE}/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
    const status = res.status;
    const transaction = await handleResponse<Transaction>(res);
    return { transaction, status };
  },

  async authorizeHold(payload: CreateHoldPayload, idempotencyKey: string): Promise<{ transaction: Transaction; status: number }> {
    const res = await fetch(`${API_BASE}/transfers/hold`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
    const status = res.status;
    const transaction = await handleResponse<Transaction>(res);
    return { transaction, status };
  },

  async settleHold(transactionId: string, idempotencyKey: string): Promise<Transaction> {
    const res = await fetch(`${API_BASE}/transfers/${encodeURIComponent(transactionId)}/settle`, {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });
    return handleResponse<Transaction>(res);
  },

  async voidHold(transactionId: string, idempotencyKey: string): Promise<Transaction> {
    const res = await fetch(`${API_BASE}/transfers/${encodeURIComponent(transactionId)}/void`, {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });
    return handleResponse<Transaction>(res);
  },

  async verifyAuditChain(): Promise<AuditReport> {
    const res = await fetch(`${API_BASE}/audit/verify`);
    return handleResponse<AuditReport>(res);
  },

  async triggerBurst(payload: BurstSimulationPayload): Promise<BurstSimulationResponse> {
    const res = await fetch(`${API_BASE}/simulator/burst`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handleResponse<BurstSimulationResponse>(res);
  },
};

export type StreamConnectionStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';

export class LedgerStreamManager {
  private eventSource: EventSource | null = null;
  private listeners: ((event: StreamEvent) => void)[] = [];
  private statusListeners: ((status: StreamConnectionStatus) => void)[] = [];
  private reconnectTimer: number | null = null;
  private currentStatus: StreamConnectionStatus = 'DISCONNECTED';

  public connect(): void {
    if (this.eventSource) {
      this.disconnect();
    }

    this.setStatus('CONNECTING');
    try {
      this.eventSource = new EventSource(`${API_BASE}/stream/transactions`);

      this.eventSource.onopen = () => {
        this.setStatus('CONNECTED');
      };

      this.eventSource.onmessage = (e) => {
        try {
          const data: StreamEvent = JSON.parse(e.data);
          this.notifyListeners(data);
        } catch {
          // ignore non-json ping
        }
      };

      this.eventSource.onerror = () => {
        this.setStatus('DISCONNECTED');
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }
        // Auto-reconnect after 3s
        if (!this.reconnectTimer) {
          this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, 3000);
        }
      };
    } catch {
      this.setStatus('DISCONNECTED');
    }
  }

  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.setStatus('DISCONNECTED');
  }

  public onEvent(callback: (event: StreamEvent) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  public onStatusChange(callback: (status: StreamConnectionStatus) => void): () => void {
    this.statusListeners.push(callback);
    callback(this.currentStatus);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== callback);
    };
  }

  private setStatus(status: StreamConnectionStatus): void {
    this.currentStatus = status;
    this.statusListeners.forEach((l) => l(status));
  }

  private notifyListeners(event: StreamEvent): void {
    this.listeners.forEach((l) => l(event));
  }
}

export const globalStream = new LedgerStreamManager();
