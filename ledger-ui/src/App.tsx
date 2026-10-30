import React, { useEffect, useState, useCallback } from 'react';
import {
  HeaderTelemetryBar
} from './components/HeaderTelemetryBar';
import { AccountsPane } from './components/AccountsPane';
import { VirtualizedLedgerTable } from './components/VirtualizedLedgerTable';
import { AuditInspectorDrawer } from './components/AuditInspectorDrawer';
import { TransferModal } from './components/TransferModal';
import { AccountStatementModal } from './components/AccountStatementModal';
import { AuditReportModal } from './components/AuditReportModal';
import { CreateAccountModal } from './components/CreateAccountModal';
import type { Account, AuditReport, Transaction } from './types/ledger';
import { LedgerApi, globalStream } from './services/api';
import type { StreamConnectionStatus } from './services/api';
import { Zap, CheckCircle2, AlertTriangle, X } from 'lucide-react';

export const App: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<StreamConnectionStatus>('CONNECTING');

  // Modals state
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
  const [statementAccount, setStatementAccount] = useState<Account | null>(null);
  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // Async task state
  const [isBurstRunning, setIsBurstRunning] = useState(false);
  const [isVerifyingAudit, setIsVerifyingAudit] = useState(false);
  const [lastAuditReport, setLastAuditReport] = useState<AuditReport | null>(null);
  const [toastMessage, setToastMessage] = useState<{ title: string; detail: string; type: 'success' | 'burst' | 'error' } | null>(null);

  // Load initial dataset
  const refreshAll = useCallback(async () => {
    try {
      const [accs, txs] = await Promise.all([
        LedgerApi.getAccounts(),
        LedgerApi.getTransactions(500, 0),
      ]);
      setAccounts(accs);
      setTransactions(txs);
      if (txs.length > 0 && !selectedTransaction) {
        setSelectedTransaction(txs[0]);
      }
    } catch (err: any) {
      console.error('Initial data load error:', err);
    }
  }, [selectedTransaction]);

  useEffect(() => {
    refreshAll();

    // Verify chain on boot
    LedgerApi.verifyAuditChain()
      .then(report => setLastAuditReport(report))
      .catch(e => console.warn('Audit boot check:', e));

    // Connect SSE Telemetry Stream
    globalStream.connect();
    const unsubStatus = globalStream.onStatusChange(status => setConnectionStatus(status));

    const unsubEvent = globalStream.onEvent(event => {
      if (event.transaction) {
        const tx = event.transaction;
        setTransactions(prev => {
          // If transaction already exists (e.g. settled or voided hold), update it in place
          const index = prev.findIndex(item => item.id === tx.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = tx;
            return updated;
          }
          // Prepend new transaction to front
          return [tx, ...prev];
        });

        // Also update selected transaction if active
        setSelectedTransaction(current => current && current.id === tx.id ? tx : current);
      }

      if (event.updatedAccounts && event.updatedAccounts.length > 0) {
        setAccounts(prev => {
          const map = new Map(prev.map(a => [a.id, a]));
          for (const upd of event.updatedAccounts!) {
            map.set(upd.id, upd);
          }
          return Array.from(map.values());
        });
      } else if (event.eventType === 'BURST_COMPLETED') {
        // Burst updates dozens of accounts: re-fetch chart of accounts
        LedgerApi.getAccounts().then(accs => setAccounts(accs));
        LedgerApi.getTransactions(1000, 0).then(txs => setTransactions(txs));
      }
    });

    return () => {
      unsubStatus();
      unsubEvent();
      globalStream.disconnect();
    };
  }, []);

  const handleVerifyAudit = async () => {
    setIsVerifyingAudit(true);
    try {
      const report = await LedgerApi.verifyAuditChain();
      setLastAuditReport(report);
      setIsAuditModalOpen(true);
    } catch (err: any) {
      setToastMessage({
        title: 'Audit Verification Failed',
        detail: err.message || 'Unknown error',
        type: 'error',
      });
    } finally {
      setIsVerifyingAudit(false);
    }
  };

  const handleRunBurst = async (count: number) => {
    setIsBurstRunning(true);
    try {
      const result = await LedgerApi.triggerBurst({
        burstSize: count,
        amountPerTransferMinor: 1000, // $10.00
      });

      setToastMessage({
        title: `Stress Burst Completed: ${result.successfulTransfers} Transfers`,
        detail: `${result.effectiveThroughputTps.toFixed(1)} TPS across Virtual Threads in ${result.elapsedMilliseconds}ms (${result.totalAmountTransferredFormatted})`,
        type: 'burst',
      });

      // Refresh accounts and transaction stream
      await refreshAll();
    } catch (err: any) {
      setToastMessage({
        title: 'Burst Simulation Failed',
        detail: err.message || 'Error executing burst',
        type: 'error',
      });
    } finally {
      setIsBurstRunning(false);
    }
  };

  const handleSettleHold = async (txId: string) => {
    try {
      const settled = await LedgerApi.settleHold(txId, crypto.randomUUID());
      setTransactions(prev => prev.map(t => t.id === txId ? settled : t));
      setSelectedTransaction(settled);
      const accs = await LedgerApi.getAccounts();
      setAccounts(accs);
      setToastMessage({
        title: 'Hold Settled Successfully',
        detail: `Captured authorization hold #${settled.sequenceNum} and credited settlement account.`,
        type: 'success',
      });
    } catch (err: any) {
      setToastMessage({
        title: 'Failed to Settle Hold',
        detail: err.message || 'Operation failed',
        type: 'error',
      });
    }
  };

  const handleVoidHold = async (txId: string) => {
    try {
      const voided = await LedgerApi.voidHold(txId, crypto.randomUUID());
      setTransactions(prev => prev.map(t => t.id === txId ? voided : t));
      setSelectedTransaction(voided);
      const accs = await LedgerApi.getAccounts();
      setAccounts(accs);
      setToastMessage({
        title: 'Hold Voided Successfully',
        detail: `Cancelled authorization hold #${voided.sequenceNum} and released reserved funds.`,
        type: 'success',
      });
    } catch (err: any) {
      setToastMessage({
        title: 'Failed to Void Hold',
        detail: err.message || 'Operation failed',
        type: 'error',
      });
    }
  };

  const handleJumpToHash = (targetHash: string) => {
    const found = transactions.find(t => t.hash === targetHash);
    if (found) {
      setSelectedTransaction(found);
    } else {
      setToastMessage({
        title: 'Parent Block Outside Local Window',
        detail: `Parent hash ${targetHash.slice(0, 16)}... is recorded earlier in the chain.`,
        type: 'success',
      });
    }
  };

  const handleOpenStatement = (account: Account) => {
    setStatementAccount(account);
    setIsStatementModalOpen(true);
  };

  const latestHash = transactions.length > 0 ? transactions[0].hash : '';

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--bg-app)',
    }}>
      {/* Top Telemetry & Cryptographic Invariant Bar */}
      <HeaderTelemetryBar
        accounts={accounts}
        connectionStatus={connectionStatus}
        latestTxHash={latestHash}
        totalTransactions={transactions.length}
        onVerifyAudit={handleVerifyAudit}
        onRunBurst={handleRunBurst}
        onOpenTransferModal={() => setIsTransferModalOpen(true)}
        onOpenCreateAccount={() => setIsCreateAccountOpen(true)}
        isBurstRunning={isBurstRunning}
        isVerifyingAudit={isVerifyingAudit}
        lastAuditReport={lastAuditReport}
      />

      {/* Main 3-Pane Mission Control Layout */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Left Pane: Chart of Accounts & Hierarchy Explorer */}
        <AccountsPane
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelectAccount={setSelectedAccountId}
          onOpenStatement={handleOpenStatement}
        />

        {/* Center Pane: Virtualized Real-Time Ledger Table */}
        <VirtualizedLedgerTable
          transactions={transactions}
          selectedTransactionId={selectedTransaction?.id || null}
          onSelectTransaction={setSelectedTransaction}
          filteredAccountId={selectedAccountId}
          onClearAccountFilter={() => setSelectedAccountId(null)}
        />

        {/* Right Split-Pane Drawer: Double-Entry & Cryptographic Audit Inspector */}
        {selectedTransaction && (
          <AuditInspectorDrawer
            transaction={selectedTransaction}
            onClose={() => setSelectedTransaction(null)}
            onSettleHold={handleSettleHold}
            onVoidHold={handleVoidHold}
            onJumpToHash={handleJumpToHash}
          />
        )}
      </div>

      {/* Floating Toast Notification Banner */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          background: toastMessage.type === 'burst'
            ? 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)'
            : toastMessage.type === 'error'
              ? '#3f121e'
              : '#06281e',
          border: `1px solid ${
            toastMessage.type === 'burst'
              ? '#818cf8'
              : toastMessage.type === 'error'
                ? '#f43f5e'
                : '#10b981'
          }`,
          borderRadius: '6px',
          padding: '12px 16px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          maxWidth: '480px',
          zIndex: 2000,
          animation: 'fadeIn 0.2s ease',
        }}>
          {toastMessage.type === 'burst' ? (
            <Zap size={20} style={{ color: '#a5b4fc', flexShrink: 0 }} />
          ) : toastMessage.type === 'error' ? (
            <AlertTriangle size={20} style={{ color: '#fb7185', flexShrink: 0 }} />
          ) : (
            <CheckCircle2 size={20} style={{ color: '#34d399', flexShrink: 0 }} />
          )}

          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '12px', color: '#f8fafc' }}>
              {toastMessage.title}
            </div>
            <div style={{ fontSize: '11px', color: '#cbd5e1', marginTop: '2px' }}>
              {toastMessage.detail}
            </div>
          </div>

          <button
            onClick={() => setToastMessage(null)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Transfer & Hold Builder Modal */}
      <TransferModal
        accounts={accounts}
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        onTransferSuccess={(tx) => {
          setSelectedTransaction(tx);
          refreshAll();
        }}
      />

      {/* Account Statement & Running Balance Modal */}
      <AccountStatementModal
        account={statementAccount}
        isOpen={isStatementModalOpen}
        onClose={() => {
          setIsStatementModalOpen(false);
          setStatementAccount(null);
        }}
      />

      {/* Cryptographic SHA-256 Audit Verification Modal */}
      <AuditReportModal
        report={lastAuditReport}
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        onReverify={handleVerifyAudit}
        isLoading={isVerifyingAudit}
      />

      {/* Create Institutional Account Modal */}
      <CreateAccountModal
        isOpen={isCreateAccountOpen}
        onClose={() => setIsCreateAccountOpen(false)}
        onAccountCreated={(newAcc) => {
          setAccounts(prev => [...prev, newAcc]);
          setToastMessage({
            title: 'Account Created',
            detail: `Created ${newAcc.accountNumber} (${newAcc.currency}) under ${newAcc.type}.`,
            type: 'success',
          });
        }}
      />
    </div>
  );
};

export default App;
