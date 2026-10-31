import React from 'react';
import {
  ShieldCheck,
  Zap,
  Plus,
  RefreshCw,
  Cpu,
  RotateCcw,
  Building,
  Check
} from 'lucide-react';
import type { Account, AuditReport } from '../types/ledger';
import { formatMinor } from '../utils/money';
import type { StreamConnectionStatus } from '../services/api';
import type { EngineMode } from '../api/LedgerClient';

interface HeaderTelemetryBarProps {
  accounts: Account[];
  connectionStatus: StreamConnectionStatus;
  latestTxHash: string;
  totalTransactions: number;
  engineMode: EngineMode;
  onToggleEngineMode: () => void;
  onResetState?: () => void;
  onVerifyAudit: () => void;
  onRunBurst: (count: number) => void;
  onOpenTransferModal: () => void;
  onOpenCreateAccount: () => void;
  isBurstRunning: boolean;
  isVerifyingAudit: boolean;
  lastAuditReport: AuditReport | null;
}

export const HeaderTelemetryBar: React.FC<HeaderTelemetryBarProps> = ({
  accounts,
  connectionStatus,
  latestTxHash,
  totalTransactions,
  engineMode,
  onToggleEngineMode,
  onResetState,
  onVerifyAudit,
  onRunBurst,
  onOpenTransferModal,
  onOpenCreateAccount,
  isBurstRunning,
  isVerifyingAudit,
  lastAuditReport,
}) => {
  const burstCount = 500;

  // Calculate Global Double-Entry Invariant across all accounts
  let totalDebits = 0n;
  let totalCredits = 0n;
  for (const acc of accounts) {
    totalDebits += BigInt(acc.postedDebitsMinor || 0);
    totalCredits += BigInt(acc.postedCreditsMinor || 0);
  }
  const discrepancy = totalDebits - totalCredits;
  const isGlobalBalanced = discrepancy === 0n;

  const isJava = engineMode === 'JAVA_21_BACKEND';

  return (
    <header style={{
      height: '38px',
      background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--border-grid)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 10px',
      gap: '8px',
      flexShrink: 0,
      zIndex: 10,
      userSelect: 'none',
    }}>
      {/* Brand & Connection & Engine Mode */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          paddingRight: '8px',
          borderRight: '1px solid var(--border-grid)',
        }}>
          <span className="font-mono" style={{
            fontWeight: 700,
            fontSize: '12px',
            letterSpacing: '0.06em',
            color: '#f8fafc',
          }}>
            CORE//LEDGER
          </span>
          <span className="font-mono" style={{
            fontSize: '10px',
            color: isJava ? 'var(--border-accent)' : '#a78bfa',
            background: 'var(--bg-canvas)',
            padding: '1px 4px',
            border: '1px solid var(--border-grid)',
            borderRadius: '2px',
          }}>
            {isJava ? 'v2.1-WAL' : 'v2.1-KERNEL'}
          </span>
        </div>

        {/* Engine Mode Toggle */}
        <button
          onClick={onToggleEngineMode}
          className="btn btn-secondary"
          style={{ height: '26px', padding: '0 7px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}
          title="Toggle between Java 21 Backend and Standalone Embedded Kernel"
        >
          <Cpu size={12} strokeWidth={1.5} style={{ color: isJava ? 'var(--border-accent)' : '#a78bfa' }} />
          <span>{isJava ? 'JAVA 21 + WAL' : 'STANDALONE KERNEL'}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '9px' }}>[SWITCH]</span>
        </button>

        {/* Live SSE Stream Telemetry */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          padding: '2px 6px',
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border-grid)',
          borderRadius: '2px',
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
        }} title={`Telemetry Stream: ${connectionStatus}`}>
          <div className={`dot-indicator ${connectionStatus.toLowerCase()}`} />
          <span style={{
            color: connectionStatus === 'CONNECTED' ? '#10b981' : connectionStatus === 'CONNECTING' ? '#f59e0b' : '#f43f5e',
            fontWeight: 600,
          }}>
            {connectionStatus}
          </span>
        </div>
      </div>

      {/* Global Invariant & Cryptographic Chain Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Global Invariant: ∑ DR == ∑ CR */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '2px 8px',
          background: isGlobalBalanced ? 'var(--acc-credit-bg)' : 'var(--acc-debit-bg)',
          border: `1px solid ${isGlobalBalanced ? 'var(--acc-credit-border)' : 'var(--acc-debit-border)'}`,
          borderRadius: '2px',
        }} title="System-wide Double-Entry Balancing Invariant">
          <span className="font-mono tabular-nums" style={{
            fontSize: '11px',
            fontWeight: 600,
            color: isGlobalBalanced ? 'var(--acc-credit)' : 'var(--acc-debit)',
          }}>
            {isGlobalBalanced ? `∑ DR = ∑ CR (${formatMinor(totalDebits)})` : `IMBALANCE: ${formatMinor(discrepancy)}`}
          </span>
        </div>

        {/* Merkle Root & Chain Length */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '2px 8px',
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border-grid)',
          borderRadius: '2px',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
        }}>
          <span style={{ color: 'var(--text-muted)' }}>CHAIN:</span>
          <span className="tabular-nums" style={{ color: 'var(--text-main)', fontWeight: 600 }}>
            {totalTransactions} BLOCKS
          </span>
          <span style={{ color: 'var(--border-strong)' }}>|</span>
          <span className="tabular-nums" style={{ color: 'var(--text-code)' }}>
            {latestTxHash ? `${latestTxHash.slice(0, 8)}..${latestTxHash.slice(-4)}` : 'GENESIS'}
          </span>
        </div>

        {/* Audit Chain Verify Button */}
        <button
          className="btn btn-secondary"
          onClick={onVerifyAudit}
          disabled={isVerifyingAudit}
          style={{ height: '26px', fontSize: '11px' }}
          title="Verify full SHA-256 chain and Merkle root against binary WAL (Hotkey: V)"
        >
          {isVerifyingAudit ? (
            <>
              <RefreshCw size={11} strokeWidth={1.5} className="animate-spin" />
              <span>Verifying...</span>
            </>
          ) : (
            <>
              <ShieldCheck size={11} strokeWidth={1.5} style={{ color: 'var(--border-accent)' }} />
              <kbd>V</kbd>
              <span>Verify Chain</span>
            </>
          )}
        </button>

        {lastAuditReport && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '10px',
            color: lastAuditReport.valid ? 'var(--acc-credit)' : 'var(--acc-debit)',
            fontFamily: 'var(--font-mono)',
            padding: '2px 5px',
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border-grid)',
            borderRadius: '2px',
          }}>
            <Check size={11} strokeWidth={2} />
            <span className="tabular-nums">{lastAuditReport.executionTimeMs}ms</span>
          </div>
        )}
      </div>

      {/* Action Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {!isJava && onResetState && (
          <button
            className="btn btn-secondary"
            onClick={onResetState}
            style={{ height: '26px', fontSize: '11px', color: '#f59e0b' }}
            title="Reset embedded standalone state back to institutional seed (Hotkey: R)"
          >
            <RotateCcw size={11} strokeWidth={1.5} />
            <kbd>R</kbd>
            <span>Reset</span>
          </button>
        )}

        <button
          className="btn btn-burst"
          onClick={() => onRunBurst(burstCount)}
          disabled={isBurstRunning}
          style={{ height: '26px', fontSize: '11px' }}
          title="Simulate 500 concurrent double-entry transfers (Hotkey: B)"
        >
          <Zap size={11} strokeWidth={1.5} />
          <kbd style={{ color: '#c4b5fd', borderColor: '#3b2d68' }}>B</kbd>
          <span>{isBurstRunning ? 'Bursting...' : '500-Tx Burst'}</span>
        </button>

        <button
          className="btn btn-secondary"
          onClick={onOpenCreateAccount}
          style={{ height: '26px', fontSize: '11px' }}
          title="Create a new account in Chart of Accounts"
        >
          <Building size={11} strokeWidth={1.5} />
          <span>New Account</span>
        </button>

        <button
          className="btn btn-primary"
          onClick={onOpenTransferModal}
          style={{ height: '26px', fontSize: '11px' }}
          title="Create Double-Entry Transfer or Authorization Hold (Hotkey: N)"
        >
          <Plus size={11} strokeWidth={2} />
          <kbd style={{ color: '#ffffff', borderColor: '#0284c7', background: 'rgba(0,0,0,0.25)' }}>N</kbd>
          <span>New Entry</span>
        </button>
      </div>
    </header>
  );
};
