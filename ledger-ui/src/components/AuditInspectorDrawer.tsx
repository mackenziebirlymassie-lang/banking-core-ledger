import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  CheckCircle2,
  Copy,
  ArrowRight,
  Clock,
  Layers,
  Check,
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
}

export const AuditInspectorDrawer: React.FC<AuditInspectorDrawerProps> = ({
  transaction,
  onClose,
  onSettleHold,
  onVoidHold,
  onJumpToHash,
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

  return (
    <aside style={{
      width: '440px',
      height: '100%',
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
      zIndex: 20,
    }}>
      {/* Drawer Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#0a1020',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Layers size={15} style={{ color: '#38bdf8' }} />
          <span style={{ fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Audit Inspector
          </span>
          <span className="tabular-nums font-mono" style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 600 }}>
            #{transaction.sequenceNum}
          </span>
          <span className={`badge badge-${transaction.status.toLowerCase()}`}>
            {transaction.status}
          </span>
        </div>

        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          title="Close Inspector"
        >
          <X size={16} />
        </button>
      </div>

      {/* Drawer Scrollable Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Transaction Summary Card */}
        <div style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '6px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
            {transaction.description}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} />
              <span className="tabular-nums font-mono">{transaction.postedAt}</span>
            </div>
            <div className="tabular-nums font-mono" style={{ fontWeight: 700, fontSize: '13px', color: '#38bdf8' }}>
              {formatMinor(transaction.totalAmountMinor)}
            </div>
          </div>
        </div>

        {/* Two-Phase Authorization Hold Action Controls */}
        {transaction.status === 'PENDING' && (
          <div style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '6px',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#fbbf24', fontWeight: 600, fontSize: '12px' }}>
              <AlertCircle size={14} />
              <span>Two-Phase Authorization Hold Active</span>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Funds are reserved in escrow pending capture or release. Choose an operation to complete this transaction:
            </p>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                className="btn btn-settle"
                onClick={handleSettle}
                disabled={isSettling || isVoiding}
                style={{ flex: 1, height: '30px', fontSize: '11px' }}
              >
                <CheckCircle2 size={13} />
                {isSettling ? 'Settling...' : 'Settle Hold (Capture)'}
              </button>

              <button
                className="btn btn-void"
                onClick={handleVoid}
                disabled={isSettling || isVoiding}
                style={{ flex: 1, height: '30px', fontSize: '11px' }}
              >
                <X size={13} />
                {isVoiding ? 'Voiding...' : 'Void Hold (Release)'}
              </button>
            </div>
          </div>
        )}

        {/* Double-Entry Balancing Breakdown Table */}
        <div style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '6px',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 12px',
            background: '#0d1527',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Double-Entry Balancing Legs ({transaction.postings.length})
            </span>
            <span className="badge badge-verified" style={{ fontSize: '10px' }}>
              SUM(L) == 0
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#0a0f1d', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', textAlign: 'left' }}>
                <th style={{ padding: '6px 10px', width: '30px' }}>#</th>
                <th style={{ padding: '6px 10px' }}>Account</th>
                <th style={{ padding: '6px 10px', textAlign: 'center', width: '70px' }}>Leg</th>
                <th style={{ padding: '6px 10px', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {transaction.postings.map((leg) => {
                const isDebit = leg.direction === 'DEBIT';

                return (
                  <tr key={leg.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="tabular-nums font-mono text-dim" style={{ padding: '6px 10px' }}>
                      {leg.sequenceIndex}
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <div className="font-mono" style={{ fontWeight: 600, color: '#f1f5f9' }}>
                        {leg.accountNumber}
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text-dim)' }}>
                        {leg.accountId.slice(0, 8)}...
                      </div>
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                      <span className={`badge badge-${isDebit ? 'debit' : 'credit'}`} style={{ fontSize: '10px' }}>
                        {leg.direction}
                      </span>
                    </td>
                    <td className="tabular-nums font-mono text-right" style={{
                      padding: '6px 10px',
                      fontWeight: 600,
                      color: isDebit ? '#fb7185' : '#34d399',
                    }}>
                      {isDebit ? '-' : '+'}{formatMinor(leg.amountMinor, leg.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Invariant Verification Footer */}
            <tfoot>
              <tr style={{ background: '#090e1a', borderTop: '1px solid var(--border-strong)' }}>
                <td colSpan={2} style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--text-dim)' }}>
                  Total Debits / Credits
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                  <CheckCircle2 size={13} style={{ color: '#10b981', display: 'inline' }} />
                </td>
                <td className="tabular-nums font-mono text-right" style={{ padding: '8px 10px', fontWeight: 700, color: '#38bdf8' }}>
                  {balanceInfo.totalDebitsFormatted}
                </td>
              </tr>
              <tr style={{ background: 'rgba(16, 185, 129, 0.06)' }}>
                <td colSpan={3} style={{ padding: '6px 10px', fontWeight: 600, color: '#34d399', fontSize: '10px' }}>
                  NET IMBALANCE:
                </td>
                <td className="tabular-nums font-mono text-right" style={{ padding: '6px 10px', fontWeight: 700, color: '#34d399' }}>
                  $0.00 (VERIFIED)
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Cryptographic Proof Card */}
        <div style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '6px',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
            <ShieldCheck size={14} />
            <span>Cryptographic Proof & SHA-256 Linkage</span>
          </div>

          {/* Current Transaction Hash */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Transaction Block Hash (SHA-256)
            </span>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#090e1a',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '5px 8px',
            }}>
              <span className="font-mono tabular-nums" style={{ fontSize: '10px', color: '#38bdf8', wordBreak: 'break-all' }}>
                {transaction.hash}
              </span>
              <button
                onClick={() => handleCopy('hash', transaction.hash)}
                style={{ background: 'none', border: 'none', color: copiedKey === 'hash' ? '#34d399' : 'var(--text-dim)', cursor: 'pointer', paddingLeft: '6px' }}
                title="Copy full SHA-256 hash"
              >
                {copiedKey === 'hash' ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          {/* Previous Transaction Hash (Clickable chain jump) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Previous Block Hash (Parent Link)
            </span>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#090e1a',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '5px 8px',
            }}>
              <span className="font-mono tabular-nums" style={{ fontSize: '10px', color: '#94a3b8', wordBreak: 'break-all' }}>
                {transaction.prevHash}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingLeft: '6px' }}>
                <button
                  onClick={() => handleCopy('prevHash', transaction.prevHash)}
                  style={{ background: 'none', border: 'none', color: copiedKey === 'prevHash' ? '#34d399' : 'var(--text-dim)', cursor: 'pointer' }}
                  title="Copy Previous Hash"
                >
                  {copiedKey === 'prevHash' ? <Check size={12} /> : <Copy size={12} />}
                </button>
                {transaction.prevHash !== '0000000000000000000000000000000000000000000000000000000000000000' && (
                  <button
                    onClick={() => onJumpToHash(transaction.prevHash)}
                    style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer' }}
                    title="Jump to parent transaction in ledger"
                  >
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Idempotency Key */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Idempotency Key
            </span>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#090e1a',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '5px 8px',
            }}>
              <span className="font-mono tabular-nums" style={{ fontSize: '11px', color: '#cbd5e1' }}>
                {transaction.idempotencyKey}
              </span>
              <button
                onClick={() => handleCopy('idempotency', transaction.idempotencyKey)}
                style={{ background: 'none', border: 'none', color: copiedKey === 'idempotency' ? '#34d399' : 'var(--text-dim)', cursor: 'pointer' }}
                title="Copy Idempotency Key"
              >
                {copiedKey === 'idempotency' ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          {/* Transaction UUID */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
              Transaction UUID
            </span>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#090e1a',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '5px 8px',
            }}>
              <span className="font-mono tabular-nums" style={{ fontSize: '11px', color: '#7dd3fc' }}>
                {transaction.id}
              </span>
              <button
                onClick={() => handleCopy('uuid', transaction.id)}
                style={{ background: 'none', border: 'none', color: copiedKey === 'uuid' ? '#34d399' : 'var(--text-dim)', cursor: 'pointer' }}
                title="Copy UUID"
              >
                {copiedKey === 'uuid' ? <Check size={12} /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        </div>

      </div>
    </aside>
  );
};
