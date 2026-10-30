export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type Direction = 'DEBIT' | 'CREDIT';
export type TransferStatus = 'PENDING' | 'POSTED' | 'VOIDED';

export interface Account {
  id: string;
  accountNumber: string;
  currency: string;
  type: AccountType;
  allowNegativeBalance: boolean;
  postedDebitsMinor: number;
  postedCreditsMinor: number;
  pendingDebitsMinor: number;
  pendingCreditsMinor: number;
  postedBalanceMinor: number;
  postedBalanceFormatted: string;
  pendingBalanceMinor: number;
  pendingBalanceFormatted: string;
  availableBalanceMinor: number;
  availableBalanceFormatted: string;
  normalBalanceDirection: Direction;
  version: number;
}

export interface Posting {
  id: string;
  transactionId: string;
  accountId: string;
  accountNumber: string;
  currency: string;
  amountMinor: number;
  amountFormatted: string;
  direction: Direction;
  sequenceIndex: number;
}

export interface Transaction {
  sequenceNum: number;
  id: string;
  idempotencyKey: string;
  description: string;
  status: TransferStatus;
  parentTransactionId?: string | null;
  postedAt: string;
  totalAmountMinor: number;
  totalAmountFormatted: string;
  prevHash: string;
  hash: string;
  postings: Posting[];
}

export interface AuditReport {
  valid: boolean;
  totalTransactionsScanned: number;
  genesisHash: string;
  latestHash: string;
  merkleRoot: string;
  verifiedAt: string;
  executionTimeMs: number;
  corruptedSequenceNum?: number | null;
  failureReason?: string | null;
}

export interface StatementEntry {
  sequenceNum: number;
  transactionId: string;
  idempotencyKey: string;
  description: string;
  status: TransferStatus;
  postedAt: string;
  postingId: string;
  direction: Direction;
  amountMinor: number;
  amountFormatted: string;
  runningBalanceMinor: number;
  runningBalanceFormatted: string;
}

export interface AccountStatement {
  account: Account;
  page: number;
  pageSize: number;
  totalEntries: number;
  entries: StatementEntry[];
}

export interface CreateAccountPayload {
  accountNumber: string;
  currency: string;
  type: AccountType;
  allowNegativeBalance: boolean;
}

export interface PostingLegPayload {
  accountId: string;
  amountMinor: number;
  direction: Direction;
}

export interface CreateTransferPayload {
  sourceAccountId?: string;
  destinationAccountId?: string;
  amountMinor?: number;
  legs?: PostingLegPayload[];
  description: string;
}

export interface CreateHoldPayload {
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: number;
  description: string;
}

export interface BurstSimulationPayload {
  burstSize: number;
  amountPerTransferMinor: number;
}

export interface BurstSimulationResponse {
  status: string;
  successfulTransfers: number;
  failedTransfers: number;
  totalAmountTransferredMinor: number;
  totalAmountTransferredFormatted: string;
  elapsedMilliseconds: number;
  effectiveThroughputTps: number;
}

export interface StreamEvent {
  eventType: 'TRANSACTION_POSTED' | 'HOLD_AUTHORIZED' | 'HOLD_SETTLED' | 'HOLD_VOIDED' | 'BURST_COMPLETED' | 'PING';
  transaction?: Transaction;
  updatedAccounts?: Account[];
  timestamp: string;
  message?: string;
}
