import React, { useEffect, useState, useCallback, useRef } from 'react';
import { HeaderTelemetryBar } from './components/HeaderTelemetryBar';
import { AccountsPane } from './components/AccountsPane';
import { VirtualizedLedgerTable, type VirtualizedLedgerTableHandle } from './components/VirtualizedLedgerTable';
import { AuditInspectorDrawer } from './components/AuditInspectorDrawer';
import { TransferModal } from './components/TransferModal';
import { AccountStatementModal } from './components/AccountStatementModal';
import { AuditReportModal } from './components/AuditReportModal';
import { CreateAccountModal } from './components/CreateAccountModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { useSettings } from './settings/SettingsContext';
import { playTick, playCommit, playAlert } from './utils/terminalAudio';
import type { Account, AuditReport, Transaction } from './types/ledger';
import { ledgerClient, type EngineMode } from './api/LedgerClient';
import type { StreamConnectionStatus } from './services/api';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

export const App: React.FC = () => {
  const { settings, isSettingsOpen, openSettings, closeSettings } = useSettings();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<StreamConnectionStatus>('CONNECTING');
  const [engineMode, setEngineMode] = useState<EngineMode>('EMBEDDED_KERNEL');

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
  const [lastAuditTime, setLastAuditTime] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<{ title: string; detail: string; type: 'success' | 'burst' | 'error' } | null>(null);

  const tableRef = useRef<VirtualizedLedgerTableHandle>(null);

  // Load initial dataset
  const refreshAll = useCallback(async () => {
    try {
      const [accs, txs] = await Promise.all([
        ledgerClient.getAccounts(),
        ledgerClient.getTransactions(500, 0),
      ]);
      setAccounts(accs);
      setTransactions(txs);
      if (txs.length > 0 && !selectedTransaction) {
        setSelectedTransaction(txs[0]);
      }
    } catch (err: any) {
      console.error('Data load error:', err);
    }
  }, [selectedTransaction]);

  useEffect(() => {
    // Detect mode and load
    ledgerClient.autoDetectMode().then(detected => {
      setEngineMode(detected);
      refreshAll();
      ledgerClient.verifyAuditChain()
        .then(report => {
          setLastAuditReport(report);
          setLastAuditTime(new Date().toTimeString().slice(0, 8));
        })
        .catch(e => console.warn('Audit boot check:', e));
    });

    const unsubMode = ledgerClient.onModeChange(m => {
      setEngineMode(m);
      refreshAll();
    });

    const unsubStatus = ledgerClient.onStatusChange(status => {
      setConnectionStatus(status);
    });

    const unsubEvent = ledgerClient.onEvent(event => {
      if (event.transaction) {
        const tx = event.transaction;
        setTransactions(prev => {
          const index = prev.findIndex(item => item.id === tx.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = tx;
            return updated;
          }
          return [tx, ...prev];
        });
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
        ledgerClient.getAccounts().then(accs => setAccounts(accs));
        ledgerClient.getTransactions(1000, 0).then(txs => setTransactions(txs));
      }
    });

    return () => {
      unsubMode();
      unsubStatus();
      unsubEvent();
    };
  }, [refreshAll]);

  // Automated background audit heartbeat
  useEffect(() => {
    if (!settings.autoAuditInterval || settings.autoAuditInterval <= 0) return;
    const intervalMs = settings.autoAuditInterval * 1000;
    const timer = setInterval(() => {
      ledgerClient.verifyAuditChain()
        .then(report => {
          setLastAuditReport(report);
          setLastAuditTime(new Date().toTimeString().slice(0, 8));
        })
        .catch(() => {});
    }, intervalMs);

    return () => clearInterval(timer);
  }, [settings.autoAuditInterval]);

  const handleVerifyAudit = async () => {
    setIsVerifyingAudit(true);
    try {
      const report = await ledgerClient.verifyAuditChain();
      setLastAuditReport(report);
      setLastAuditTime(new Date().toTimeString().slice(0, 8));
      setIsAuditModalOpen(true);
      if (report.valid) {
        playCommit(settings.audioFeedback);
      } else {
        playAlert(settings.audioFeedback);
      }
    } catch (err: any) {
      playAlert(settings.audioFeedback);
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
      const result = await ledgerClient.triggerBurst({
        burstSize: count,
        amountPerTransferMinor: 1000, // $10.00
      });

      playCommit(settings.audioFeedback);
      setToastMessage({
        title: `Stress Burst Completed: ${result.successfulTransfers} Transfers`,
        detail: `${result.effectiveThroughputTps.toFixed(1)} TPS in ${result.elapsedMilliseconds}ms (${result.totalAmountTransferredFormatted})`,
        type: 'burst',
      });

      await refreshAll();
    } catch (err: any) {
      playAlert(settings.audioFeedback);
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
      const settled = await ledgerClient.settleHold(txId, crypto.randomUUID());
      setTransactions(prev => prev.map(t => t.id === txId ? settled : t));
      setSelectedTransaction(settled);
      const accs = await ledgerClient.getAccounts();
      setAccounts(accs);
      setToastMessage({
        title: 'Hold Settled Successfully',
        detail: `Captured authorization hold #${settled.sequenceNum} and credited destination.`,
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
      const voided = await ledgerClient.voidHold(txId, crypto.randomUUID());
      setTransactions(prev => prev.map(t => t.id === txId ? voided : t));
      setSelectedTransaction(voided);
      const accs = await ledgerClient.getAccounts();
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

  const handleReplayIdempotency = async (tx: Transaction) => {
    try {
      const firstLeg = tx.postings[0];
      const secondLeg = tx.postings[1] || tx.postings[0];
      const res = await ledgerClient.executeTransfer({
        sourceAccountId: firstLeg.accountId,
        destinationAccountId: secondLeg.accountId,
        amountMinor: tx.totalAmountMinor,
        description: tx.description,
      }, tx.idempotencyKey);

      setToastMessage({
        title: `HTTP ${res.status} OK — Idempotent Replay Verified`,
        detail: `Key ${tx.idempotencyKey.slice(0, 16)}.. returned identical transaction without duplicate debit/credit.`,
        type: 'success',
      });
    } catch (err: any) {
      setToastMessage({
        title: 'Idempotency Replay Error',
        detail: err.message || 'Failed to replay',
        type: 'error',
      });
    }
  };

  const handleOpenStatement = (account: Account) => {
    setStatementAccount(account);
    setIsStatementModalOpen(true);
  };

  // Keyboard navigation & global shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

      if (e.key === 'Escape') {
        if (isSettingsOpen) closeSettings();
        else if (isTransferModalOpen) setIsTransferModalOpen(false);
        else if (isCreateAccountOpen) setIsCreateAccountOpen(false);
        else if (isStatementModalOpen) setIsStatementModalOpen(false);
        else if (isAuditModalOpen) setIsAuditModalOpen(false);
        else if (selectedTransaction) setSelectedTransaction(null);
        return;
      }

      if (isInput) return;

      if (e.key === ',') {
        e.preventDefault();
        if (isSettingsOpen) closeSettings();
        else openSettings();
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        playTick(settings.audioFeedback);
        setTransactions(currentTxs => {
          if (currentTxs.length === 0) return currentTxs;
          setSelectedTransaction(currentSel => {
            const idx = currentTxs.findIndex(t => t.id === currentSel?.id);
            if (idx === -1 || idx >= currentTxs.length - 1) return currentTxs[0];
            return currentTxs[idx + 1];
          });
          return currentTxs;
        });
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        playTick(settings.audioFeedback);
        setTransactions(currentTxs => {
          if (currentTxs.length === 0) return currentTxs;
          setSelectedTransaction(currentSel => {
            const idx = currentTxs.findIndex(t => t.id === currentSel?.id);
            if (idx <= 0) return currentTxs[currentTxs.length - 1];
            return currentTxs[idx - 1];
          });
          return currentTxs;
        });
      } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setIsTransferModalOpen(true);
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        if (!isBurstRunning) handleRunBurst(settings.defaultBurstCount);
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        if (!isVerifyingAudit) handleVerifyAudit();
      } else if (e.key === '/') {
        e.preventDefault();
        tableRef.current?.focusSearch();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isSettingsOpen,
    isTransferModalOpen,
    isCreateAccountOpen,
    isStatementModalOpen,
    isAuditModalOpen,
    selectedTransaction,
    isBurstRunning,
    isVerifyingAudit,
    settings.audioFeedback,
    settings.defaultBurstCount,
    openSettings,
    closeSettings,
  ]);

  const latestHash = transactions.length > 0 ? transactions[0].hash : '';
  const isJava = engineMode === 'JAVA_21_BACKEND';

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--bg-canvas)',
    }}>
      {/* Row 1: Command & Telemetry Strip (38px) */}
      <HeaderTelemetryBar
        accounts={accounts}
        connectionStatus={connectionStatus}
        latestTxHash={latestHash}
        totalTransactions={transactions.length}
        engineMode={engineMode}
        onToggleEngineMode={() => ledgerClient.toggleMode()}
        onResetState={() => {
          ledgerClient.resetStandaloneState();
          refreshAll();
          setToastMessage({
            title: 'State Reset Complete',
            detail: 'Embedded ledger reset to original institutional seed state.',
            type: 'success',
          });
        }}
        onVerifyAudit={handleVerifyAudit}
        onRunBurst={handleRunBurst}
        burstCount={settings.defaultBurstCount}
        onOpenTransferModal={() => setIsTransferModalOpen(true)}
        onOpenCreateAccount={() => setIsCreateAccountOpen(true)}
        onOpenSettings={openSettings}
        isBurstRunning={isBurstRunning}
        isVerifyingAudit={isVerifyingAudit}
        lastAuditReport={lastAuditReport}
      />

      {/* Row 2: Main 3-Pane Mission Control Layout (Full-bleed hairline grid) */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Left Pane (320px): Chart of Accounts Tree */}
        <AccountsPane
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelectAccount={setSelectedAccountId}
          onOpenStatement={handleOpenStatement}
        />

        {/* Center Pane (Flex-1): High-Density Virtualized Journal Grid */}
        <VirtualizedLedgerTable
          ref={tableRef}
          transactions={transactions}
          selectedTransactionId={selectedTransaction?.id || null}
          onSelectTransaction={setSelectedTransaction}
          filteredAccountId={selectedAccountId}
          onClearAccountFilter={() => setSelectedAccountId(null)}
        />

        {/* Right Split-Pane (440px): Double-Entry Voucher & Cryptographic Inspector */}
        {selectedTransaction && (
          <AuditInspectorDrawer
            transaction={selectedTransaction}
            onClose={() => setSelectedTransaction(null)}
            onSettleHold={handleSettleHold}
            onVoidHold={handleVoidHold}
            onJumpToHash={handleJumpToHash}
            onReplayIdempotency={handleReplayIdempotency}
          />
        )}
      </div>

      {/* Row 3: Institutional Bottom Status Bar (24px) */}
      <footer style={{
        height: '32px',
        background: 'var(--bg-elevated)',
        borderTop: '1px solid var(--border-grid)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        fontSize: '11px',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        flexShrink: 0,
        userSelect: 'none',
        zIndex: 5,
      }}>
        {/* Keyboard shortcut guide */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span><kbd>↑/↓</kbd> Navigate</span>
          <span><kbd>N</kbd> New Entry</span>
          <span><kbd>B</kbd> Burst</span>
          <span><kbd>V</kbd> Audit</span>
          <span><kbd>,</kbd> Settings</span>
          <span><kbd>/</kbd> Search</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>

        {/* Storage engine info & audit status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span>
            STORAGE: {isJava ? 'PostgreSQL/H2 + WAL (/data/ledger.wal)' : 'Web Crypto Local SHA-256 Kernel'}
          </span>
          <span style={{ color: 'var(--border-grid)' }}>|</span>
          <span style={{ color: lastAuditReport?.valid ? 'var(--acc-credit)' : 'var(--text-muted)' }}>
            AUDIT: {lastAuditReport?.valid ? `${lastAuditReport.totalTransactionsScanned} BLOCKS OK (${lastAuditTime || 'BOOT'})` : 'PENDING SCAN'}
          </span>
        </div>
      </footer>

      {/* Floating Toast Notification Banner (Institutional flat styling) */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '40px',
          right: '24px',
          background: 'var(--bg-panel)',
          border: `1px solid ${
            toastMessage.type === 'burst'
              ? '#6366f1'
              : toastMessage.type === 'error'
                ? 'var(--acc-debit)'
                : 'var(--acc-credit)'
          }`,
          borderRadius: '2px',
          padding: '12px 16px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          maxWidth: '420px',
          zIndex: 2000,
        }}>
          {toastMessage.type === 'burst' ? (
            <Info size={14} strokeWidth={1.5} style={{ color: '#818cf8', flexShrink: 0 }} />
          ) : toastMessage.type === 'error' ? (
            <AlertTriangle size={14} strokeWidth={1.5} style={{ color: 'var(--acc-debit)', flexShrink: 0 }} />
          ) : (
            <CheckCircle2 size={14} strokeWidth={1.5} style={{ color: 'var(--acc-credit)', flexShrink: 0 }} />
          )}

          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '11px', color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>
              {toastMessage.title}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '1px' }}>
              {toastMessage.detail}
            </div>
          </div>

          <button
            onClick={() => setToastMessage(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
          >
            <X size={12} strokeWidth={1.5} />
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

      {/* System Preferences & Operational Configuration Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={closeSettings}
        engineMode={engineMode}
        connectionStatus={connectionStatus}
        totalTransactions={transactions.length}
        onRefreshData={refreshAll}
        onTriggerToast={setToastMessage}
      />
    </div>
  );
};

export default App;
