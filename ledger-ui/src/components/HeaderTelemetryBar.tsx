import React from 'react';
import {
  ShieldCheck,
  Zap,
  Plus,
  RefreshCw,
  Cpu,
  RotateCcw,
  Building,
  Check,
  Sliders
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
  onOpenSettings?: () => void;
  burstCount?: number;
  isBurstRunning: boolean;
  isVerifyingAudit: boolean;
  lastAuditReport: AuditReport | null;
}

const LedgerVaultEmblem: React.FC = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ flexShrink: 0 }}
  >
    <defs>
      <radialGradient id="vaultBgHeader" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#0f172a" />
        <stop offset="100%" stopColor="#07090e" />
      </radialGradient>
      <linearGradient id="cyanGradHeader" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="100%" stopColor="#0284c7" />
      </linearGradient>
      <linearGradient id="emeraldGradHeader" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#34d399" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="94" height="94" rx="21" fill="url(#vaultBgHeader)" stroke="#1e2638" strokeWidth="2.5" />
    <circle cx="50" cy="50" r="32" stroke="#161f33" strokeWidth="3" />
    <line x1="50" y1="16" x2="50" y2="20" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
    <line x1="50" y1="80" x2="50" y2="84" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
    <line x1="16" y1="50" x2="20" y2="50" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
    <line x1="80" y1="50" x2="84" y2="50" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
    <path d="M 50 28 A 22 22 0 0 0 50 72" stroke="url(#cyanGradHeader)" strokeWidth="6" strokeLinecap="round" />
    <path d="M 50 28 A 22 22 0 0 1 50 72" stroke="url(#emeraldGradHeader)" strokeWidth="6" strokeLinecap="round" />
    <line x1="36" y1="50" x2="64" y2="50" stroke="#f1f5f9" strokeWidth="2.5" strokeLinecap="round" />
    <polygon points="50,45 55,50 50,55 45,50" fill="#f8fafc" stroke="#38bdf8" strokeWidth="1.2" />
    <circle cx="50" cy="50" r="1.5" fill="#0284c7" />
  </svg>
);

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
  onOpenSettings,
  burstCount = 500,
  isBurstRunning,
  isVerifyingAudit,
  lastAuditReport,
}) => {

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
          <LedgerVaultEmblem />
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
          title={`Simulate ${burstCount} concurrent double-entry transfers (Hotkey: B)`}
        >
          <Zap size={11} strokeWidth={1.5} />
          <kbd style={{ color: '#c4b5fd', borderColor: '#3b2d68' }}>B</kbd>
          <span>{isBurstRunning ? 'Bursting...' : `${burstCount}-Tx Burst`}</span>
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
        {onOpenSettings && (
          <button
            className="btn btn-secondary"
            onClick={onOpenSettings}
            style={{ height: '26px', fontSize: '11px' }}
            title="Open System Configuration & Preferences (Hotkey: ,)"
          >
            <Sliders size={11} strokeWidth={1.5} style={{ color: 'var(--border-accent)' }} />
            <kbd>,</kbd>
            <span>Config</span>
          </button>
        )}
      </div>
    </header>
  );
};
