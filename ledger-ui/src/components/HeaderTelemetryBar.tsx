import React from 'react';
import {
  ShieldCheck,
  Zap,
  ArrowRightLeft,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  Database,
  Cpu,
  RotateCcw
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
      height: '56px',
      background: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      gap: '12px',
      flexShrink: 0,
      zIndex: 10,
    }}>
      {/* Brand & Connection Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: '14px',
            fontFamily: 'var(--font-mono)',
            boxShadow: '0 0 10px rgba(2, 132, 199, 0.4)'
          }}>
            L
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.04em', textTransform: 'uppercase', color: '#f8fafc' }}>
                Ledger Engine
              </span>
              <span style={{
                fontSize: '10px',
                padding: '1px 5px',
                borderRadius: '3px',
                background: '#1e293b',
                color: '#38bdf8',
                fontFamily: 'var(--font-mono)'
              }}>
                CORE-v1
              </span>
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.02em' }}>
              TREASURY MISSION CONTROL
            </div>
          </div>
        </div>

        {/* Engine Mode Pill & Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 8px',
          background: isJava ? 'rgba(56, 189, 248, 0.1)' : 'rgba(168, 85, 247, 0.1)',
          border: `1px solid ${isJava ? 'rgba(56, 189, 248, 0.3)' : 'rgba(168, 85, 247, 0.3)'}`,
          borderRadius: '4px',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          cursor: 'pointer',
        }}
        onClick={onToggleEngineMode}
        title="Click to toggle between Java 21 Backend and Standalone Embedded Kernel"
        >
          <Cpu size={13} style={{ color: isJava ? '#38bdf8' : '#c084fc' }} />
          <span style={{ color: isJava ? '#7dd3fc' : '#e9d5ff', fontWeight: 600 }}>
            {isJava ? 'ENGINE: JAVA 21 + WAL (CONNECTED)' : 'ENGINE: STANDALONE KERNEL (LOCAL)'}
          </span>
          <span style={{ fontSize: '9px', color: 'var(--text-dim)', marginLeft: '4px' }}>
            [SWITCH]
          </span>
        </div>

        {/* Live SSE Stream Indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 8px',
          background: 'var(--bg-app)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '4px',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)'
        }} title={`Telemetry Stream: ${connectionStatus}`}>
          <div className={`pulse-dot ${connectionStatus.toLowerCase()}`} />
          <span style={{ color: connectionStatus === 'CONNECTED' ? '#34d399' : '#fb7185', fontWeight: 600 }}>
            {connectionStatus}
          </span>
        </div>
      </div>

      {/* Global Invariant & Cryptographic Chain Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {/* Invariant Status: Sum(Debits) == Sum(Credits) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 10px',
          background: isGlobalBalanced ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.12)',
          border: `1px solid ${isGlobalBalanced ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.4)'}`,
          borderRadius: '4px',
        }}>
          <Database size={13} style={{ color: isGlobalBalanced ? '#10b981' : '#f43f5e' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Global Invariant
            </span>
            <span className="tabular-nums font-mono" style={{
              fontSize: '11px',
              fontWeight: 700,
              color: isGlobalBalanced ? '#34d399' : '#fb7185'
            }}>
              {isGlobalBalanced ? `∑ Debits == ∑ Credits (${formatMinor(totalDebits)})` : `IMBALANCE: ${formatMinor(discrepancy)}`}
            </span>
          </div>
        </div>

        {/* SHA-256 Chain Status Pill */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '4px 10px',
          background: 'var(--bg-app)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '4px',
        }}>
          <ShieldCheck size={14} style={{ color: '#38bdf8' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase' }}>
                SHA-256 Chain
              </span>
              <span className="tabular-nums font-mono" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                [{totalTransactions} txs]
              </span>
            </div>
            <div className="font-mono tabular-nums" style={{ fontSize: '10px', color: '#7dd3fc' }}>
              {latestTxHash ? `${latestTxHash.slice(0, 10)}...${latestTxHash.slice(-6)}` : 'GENESIS'}
            </div>
          </div>
        </div>

        {/* Verify Audit Chain Button */}
        <button
          className="btn btn-secondary"
          onClick={onVerifyAudit}
          disabled={isVerifyingAudit}
          style={{ height: '30px', fontSize: '11px' }}
          title="Verify full SHA-256 chain and Merkle root against binary WAL"
        >
          {isVerifyingAudit ? (
            <>
              <RefreshCw size={12} className="animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              <ShieldCheck size={12} style={{ color: '#38bdf8' }} />
              Verify Audit Chain
            </>
          )}
        </button>

        {/* Audit Status Pill if verified */}
        {lastAuditReport && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '11px',
            color: lastAuditReport.valid ? '#34d399' : '#fb7185',
            fontFamily: 'var(--font-mono)',
          }}>
            <CheckCircle2 size={12} />
            <span className="tabular-nums">{lastAuditReport.executionTimeMs}ms</span>
          </div>
        )}
      </div>

      {/* Action Controls: Stress Burst & New Transfer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {!isJava && onResetState && (
          <button
            className="btn btn-secondary"
            onClick={onResetState}
            style={{ height: '32px', color: '#f59e0b' }}
            title="Reset standalone localStorage state back to institutional seed"
          >
            <RotateCcw size={12} />
            Reset State
          </button>
        )}

        <button
          className="btn btn-burst"
          onClick={() => onRunBurst(burstCount)}
          disabled={isBurstRunning}
          style={{ height: '32px' }}
          title="Spawn 500 concurrent transfers"
        >
          <Zap size={13} />
          {isBurstRunning ? 'Running 500-Tx Burst...' : 'Run 500-Tx Stress Burst'}
        </button>

        <button
          className="btn btn-secondary"
          onClick={onOpenCreateAccount}
          style={{ height: '32px' }}
          title="Add a new institutional account to chart of accounts"
        >
          <PlusCircle size={13} />
          New Account
        </button>

        <button
          className="btn btn-primary"
          onClick={onOpenTransferModal}
          style={{ height: '32px' }}
          title="Create Double-Entry Transfer or Two-Phase Hold"
        >
          <ArrowRightLeft size={13} />
          Transfer / Hold
        </button>
      </div>
    </header>
  );
};
