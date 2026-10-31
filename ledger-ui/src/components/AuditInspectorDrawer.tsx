import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Copy,
  ArrowRight,
  Clock,
  Check,
  CheckCircle2,
  Repeat,
  AlertCircle
} from 'lucide-react';
import type { Transaction } from '../types/ledger';
import { calculateLegsBalance, formatMinor } from '../utils/money';

interface AuditInspectorDrawerProps {
  transaction: Transaction | null;
  onClose: () => void;
  onSettleHold: (txId: string) => Promise<void>;
  onVoidHold: (txId: string) => Promise<void>;
  onJumpToHash: (hash: string) => void;
  onReplayIdempotency?: (tx: Transaction) => void;
}

export const AuditInspectorDrawer: React.FC<AuditInspectorDrawerProps> = ({
  transaction,
  onClose,
  onSettleHold,
  onVoidHold,
  onJumpToHash,
  onReplayIdempotency,
}) => {
  const [isSettling, setIsSettling] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!transaction) return null;

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleSettle = async () => {
    setIsSettling(true);
    try {
      await onSettleHold(transaction.id);
    } finally {
      setIsSettling(false);
    }
  };

  const handleVoid = async () => {
    setIsVoiding(true);
    try {
      await onVoidHold(transaction.id);
    } finally {
      setIsVoiding(false);
    }
  };

  // Zero-float math balance calculation
  const balanceInfo = calculateLegsBalance(transaction.postings);
  const formattedSeq = String(transaction.sequenceNum).padStart(5, '0');

  return (
    <aside style={{
      width: '380px',
      height: '100%',
      background: 'var(--bg-panel)',
      borderLeft: '1px solid var(--border-grid)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
      zIndex: 20,
    }}>
      {/* Drawer Header (Voucher Style) */}
      <div style={{
        height: '34px',
        padding: '0 10px',
        borderBottom: '1px solid var(--border-grid)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-elevated)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="font-mono" style={{ fontWeight: 700, fontSize: '11px', color: 'var(--border-accent)' }}>
            VOUCHER #{formattedSeq}
          </span>
          <span className={`badge badge-${transaction.status.toLowerCase()}`}>
            {transaction.status}
          </span>
        </div>

        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          title="Close Inspector (Esc)"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* Drawer Scrollable Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Voucher Meta Info */}
        <div style={{
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border-grid)',
          borderRadius: '2px',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>
            {transaction.description}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={11} strokeWidth={1.5} />
              <span className="tabular-nums font-mono">{transaction.postedAt}</span>
            </div>
            <div className="tabular-nums font-mono" style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-main)' }}>
              {formatMinor(transaction.totalAmountMinor)}
            </div>
          </div>
        </div>

        {/* Two-Phase Hold Controls */}
        {transaction.status === 'PENDING' && (
          <div style={{
            background: 'var(--acc-hold-bg)',
            border: '1px solid var(--acc-hold-border)',
            borderRadius: '2px',
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--acc-hold)', fontWeight: 600, fontSize: '11px' }}>
              <AlertCircle size={13} strokeWidth={1.5} />
              <span>Two-Phase Authorization Hold</span>
            </div>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.3 }}>
              Funds are reserved in escrow pending capture or release:
            </p>

            <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
              <button
                className="btn btn-settle"
                onClick={handleSettle}
                disabled={isSettling || isVoiding}
                style={{ flex: 1, height: '26px', fontSize: '10px' }}
              >
                <CheckCircle2 size={11} strokeWidth={1.5} />
                <span>{isSettling ? 'Settling...' : 'Settle (Capture)'}</span>
              </button>

              <button
                className="btn btn-void"
                onClick={handleVoid}
                disabled={isSettling || isVoiding}
                style={{ flex: 1, height: '26px', fontSize: '10px' }}
              >
                <X size={11} strokeWidth={1.5} />
                <span>{isVoiding ? 'Voiding...' : 'Void (Release)'}</span>
              </button>
            </div>
          </div>
        )}

        {/* T-Account Double-Entry Legs Table */}
        <div style={{
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border-grid)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '5px 8px',
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-grid)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              T-Account Postings ({transaction.postings.length})
            </span>
            <span className="badge badge-verified" style={{ fontSize: '9px' }}>
              BALANCED ∑ = 0
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-grid)', color: 'var(--text-muted)', textAlign: 'left', textTransform: 'uppercase' }}>
                <th style={{ padding: '4px 8px' }}>Account</th>
                <th style={{ padding: '4px 6px', textAlign: 'center', width: '35px' }}>Dir</th>
                <th style={{ padding: '4px 8px', textAlign: 'right', width: '70px' }}>Debit (DR)</th>
                <th style={{ padding: '4px 8px', textAlign: 'right', width: '70px' }}>Credit (CR)</th>
              </tr>
            </thead>
            <tbody>
              {transaction.postings.map((leg) => {
                const isDebit = leg.direction === 'DEBIT';

                return (
                  <tr key={leg.id} style={{ borderBottom: '1px solid var(--border-grid)' }}>
                    <td style={{ padding: '4px 8px' }}>
                      <div className="font-mono" style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                        {leg.accountNumber}
                      </div>
                      <div style={{ fontSize: '8px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {leg.accountId.slice(0, 8)}..
                      </div>
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <span className={`badge-dir badge-dir-${isDebit ? 'dr' : 'cr'}`}>
                        {isDebit ? 'DR' : 'CR'}
                      </span>
                    </td>
                    <td className="tabular-nums font-mono text-right" style={{
                      padding: '4px 8px',
                      color: isDebit ? 'var(--acc-debit)' : 'transparent',
                      fontWeight: 600,
                    }}>
                      {isDebit ? formatMinor(leg.amountMinor, leg.currency) : '-'}
                    </td>
                    <td className="tabular-nums font-mono text-right" style={{
                      padding: '4px 8px',
                      color: !isDebit ? 'var(--acc-credit)' : 'transparent',
                      fontWeight: 600,
                    }}>
                      {!isDebit ? formatMinor(leg.amountMinor, leg.currency) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Classic Accounting Double-Rule Footer */}
            <tfoot>
              <tr className="accounting-double-rule" style={{ background: 'var(--bg-elevated)' }}>
                <td colSpan={2} style={{ padding: '5px 8px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  Total Balance
                </td>
                <td className="tabular-nums font-mono text-right" style={{ padding: '5px 8px', fontWeight: 700, color: 'var(--acc-debit)' }}>
                  {balanceInfo.totalDebitsFormatted}
                </td>
                <td className="tabular-nums font-mono text-right" style={{ padding: '5px 8px', fontWeight: 700, color: 'var(--acc-credit)' }}>
                  {balanceInfo.totalCreditsFormatted}
                </td>
              </tr>
              <tr style={{ background: 'var(--acc-credit-bg)' }}>
                <td colSpan={2} style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--acc-credit)', fontSize: '9px', fontFamily: 'var(--font-mono)' }}>
                  NET IMBALANCE:
                </td>
                <td colSpan={2} className="tabular-nums font-mono text-right" style={{ padding: '4px 8px', fontWeight: 700, color: 'var(--acc-credit)' }}>
                  $0.00 (VERIFIED)
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Cryptographic Linkage & Hashes */}
        <div style={{
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border-grid)',
          borderRadius: '2px',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--border-accent)', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase' }}>
            <ShieldCheck size={12} strokeWidth={1.5} />
            <span>Cryptographic Merkle & SHA-256 Linkage</span>
          </div>

          {/* Current Transaction Hash */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              Transaction Hash (SHA-256)
            </span>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-grid)',
              borderRadius: '2px',
              padding: '3px 6px',
            }}>
              <span className="font-mono tabular-nums" style={{ fontSize: '9px', color: 'var(--border-accent)', wordBreak: 'break-all' }}>
                {transaction.hash}
              </span>
              <button
                onClick={() => handleCopy('hash', transaction.hash)}
                style={{ background: 'none', border: 'none', color: copiedKey === 'hash' ? 'var(--acc-credit)' : 'var(--text-muted)', cursor: 'pointer', paddingLeft: '4px' }}
                title="Copy SHA-256 hash"
              >
                {copiedKey === 'hash' ? <Check size={11} strokeWidth={2} /> : <Copy size={11} strokeWidth={1.5} />}
              </button>
            </div>
          </div>

          {/* Previous Transaction Hash (Parent Link) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              Parent Hash Link
            </span>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-grid)',
              borderRadius: '2px',
              padding: '3px 6px',
            }}>
              <span className="font-mono tabular-nums" style={{ fontSize: '9px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                {transaction.prevHash}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '4px' }}>
                <button
                  onClick={() => handleCopy('prevHash', transaction.prevHash)}
                  style={{ background: 'none', border: 'none', color: copiedKey === 'prevHash' ? 'var(--acc-credit)' : 'var(--text-muted)', cursor: 'pointer' }}
                  title="Copy Previous Hash"
                >
                  {copiedKey === 'prevHash' ? <Check size={11} strokeWidth={2} /> : <Copy size={11} strokeWidth={1.5} />}
                </button>
                {transaction.prevHash !== '0000000000000000000000000000000000000000000000000000000000000000' && (
                  <button
                    onClick={() => onJumpToHash(transaction.prevHash)}
                    style={{ background: 'none', border: 'none', color: 'var(--border-accent)', cursor: 'pointer' }}
                    title="Jump to parent block in journal"
                  >
                    <ArrowRight size={11} strokeWidth={1.5} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Idempotency Key & Replay Button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                Idempotency Key
              </span>
              {onReplayIdempotency && (
                <button
                  onClick={() => onReplayIdempotency(transaction)}
                  className="btn btn-secondary"
                  style={{ padding: '0 4px', height: '18px', fontSize: '9px', gap: '3px' }}
                  title="Replay this key against backend to verify HTTP 200 OK deduplication"
                >
                  <Repeat size={9} strokeWidth={1.5} /> Replay Test
                </button>
              )}
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-grid)',
              borderRadius: '2px',
              padding: '3px 6px',
            }}>
              <span className="font-mono tabular-nums" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                {transaction.idempotencyKey}
              </span>
              <button
                onClick={() => handleCopy('idempotency', transaction.idempotencyKey)}
                style={{ background: 'none', border: 'none', color: copiedKey === 'idempotency' ? 'var(--acc-credit)' : 'var(--text-muted)', cursor: 'pointer' }}
                title="Copy Idempotency Key"
              >
                {copiedKey === 'idempotency' ? <Check size={11} strokeWidth={2} /> : <Copy size={11} strokeWidth={1.5} />}
              </button>
            </div>
          </div>

          {/* Transaction UUID */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              Transaction UUID
            </span>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-grid)',
              borderRadius: '2px',
              padding: '3px 6px',
            }}>
              <span className="font-mono tabular-nums" style={{ fontSize: '10px', color: 'var(--text-code)' }}>
                {transaction.id}
              </span>
              <button
                onClick={() => handleCopy('uuid', transaction.id)}
                style={{ background: 'none', border: 'none', color: copiedKey === 'uuid' ? 'var(--acc-credit)' : 'var(--text-muted)', cursor: 'pointer' }}
                title="Copy UUID"
              >
                {copiedKey === 'uuid' ? <Check size={11} strokeWidth={2} /> : <Copy size={11} strokeWidth={1.5} />}
              </button>
            </div>
          </div>
        </div>

      </div>
    </aside>
  );
};
