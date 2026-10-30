import React, { useRef, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Search,
  X
} from 'lucide-react';
import type { Transaction, TransferStatus } from '../types/ledger';
import { formatMinor } from '../utils/money';

interface VirtualizedLedgerTableProps {
  transactions: Transaction[];
  selectedTransactionId: string | null;
  onSelectTransaction: (transaction: Transaction) => void;
  filteredAccountId: string | null;
  onClearAccountFilter: () => void;
}

function formatTimestamp(isoString: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
  } catch {
    return isoString;
  }
}

export const VirtualizedLedgerTable: React.FC<VirtualizedLedgerTableProps> = ({
  transactions,
  selectedTransactionId,
  onSelectTransaction,
  filteredAccountId,
  onClearAccountFilter,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TransferStatus>('ALL');
  const handleCopy = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
  };

  // High-performance filter without dropping frames
  const filtered = useMemo(() => {
    let result = transactions;

    if (filteredAccountId) {
      result = result.filter(tx =>
        tx.postings.some(p => p.accountId === filteredAccountId)
      );
    }

    if (statusFilter !== 'ALL') {
      result = result.filter(tx => tx.status === statusFilter);
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(tx =>
        tx.description.toLowerCase().includes(q) ||
        tx.idempotencyKey.toLowerCase().includes(q) ||
        tx.id.toLowerCase().includes(q) ||
        tx.hash.toLowerCase().includes(q) ||
        String(tx.sequenceNum).includes(q) ||
        tx.postings.some(p => p.accountNumber.toLowerCase().includes(q))
      );
    }

    return result;
  }, [transactions, filteredAccountId, statusFilter, searchTerm]);

  // Viewport Virtualization
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 38,
    overscan: 20,
  });

  return (
    <main style={{
      flex: 1,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-app)',
      overflow: 'hidden',
    }}>
      {/* Table Control & Filter Header */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexShrink: 0,
      }}>
        {/* Search & Status Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-app)',
            border: '1px solid var(--border-strong)',
            borderRadius: '4px',
            padding: '5px 10px',
            maxWidth: '380px',
            width: '100%',
          }}>
            <Search size={13} style={{ color: 'var(--text-dim)' }} />
            <input
              type="text"
              placeholder="Filter by description, UUID, idempotency key, SHA-256 hash..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-main)',
                fontSize: '12px',
                width: '100%',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Status Filter Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {(['ALL', 'POSTED', 'PENDING', 'VOIDED'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`btn ${statusFilter === status ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '3px 8px', fontSize: '11px', height: '26px' }}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Active Account Filter Chip */}
          {filteredAccountId && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '4px',
              color: '#38bdf8',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)'
            }}>
              <span>Filtered by Account</span>
              <button
                onClick={onClearAccountFilter}
                style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Real-time stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
          <span className="tabular-nums font-mono">
            {filtered.length.toLocaleString()} of {transactions.length.toLocaleString()} rows
          </span>
          <span style={{ color: 'var(--border-strong)' }}>|</span>
          <span style={{ color: '#34d399', fontSize: '10px', fontWeight: 600 }}>
            60 FPS VIRTUALIZED
          </span>
        </div>
      </div>

      {/* Fixed Grid Header with 100% pixel-aligned columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '65px 110px 85px 1fr 130px 110px 130px 110px',
        background: '#0a101f',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--text-dim)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        padding: '8px 16px',
        flexShrink: 0,
        userSelect: 'none',
      }}>
        <div className="tabular-nums text-right" style={{ paddingRight: '8px' }}>Seq #</div>
        <div className="tabular-nums text-left font-mono">Timestamp</div>
        <div className="text-center">Status</div>
        <div className="text-left" style={{ paddingLeft: '8px' }}>Description & Legs</div>
        <div className="tabular-nums text-right font-mono" style={{ paddingRight: '12px' }}>Amount</div>
        <div className="text-left font-mono">Tx UUID</div>
        <div className="text-left font-mono">Idempotency Key</div>
        <div className="text-left font-mono">SHA-256 Hash</div>
      </div>

      {/* Virtualized Table Scroll Container */}
      <div
        ref={parentRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{
            height: '240px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            color: 'var(--text-dim)',
          }}>
            <Search size={24} style={{ opacity: 0.4 }} />
            <span>No transactions match the selected filter criteria</span>
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const tx = filtered[virtualRow.index];
              const isSelected = selectedTransactionId === tx.id;

              return (
                <div
                  key={tx.id}
                  onClick={() => onSelectTransaction(tx)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    display: 'grid',
                    gridTemplateColumns: '65px 110px 85px 1fr 130px 110px 130px 110px',
                    alignItems: 'center',
                    padding: '0 16px',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: isSelected
                      ? 'var(--bg-card-hover)'
                      : virtualRow.index % 2 === 0
                        ? 'var(--bg-app)'
                        : 'rgba(15, 23, 42, 0.4)',
                    cursor: 'pointer',
                    transition: 'background 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = '#121b2f';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background =
                        virtualRow.index % 2 === 0 ? 'var(--bg-app)' : 'rgba(15, 23, 42, 0.4)';
                    }
                  }}
                >
                  {/* Sequence # */}
                  <div className="tabular-nums font-mono text-right" style={{
                    color: '#94a3b8',
                    fontWeight: 600,
                    fontSize: '11px',
                    paddingRight: '8px',
                  }}>
                    #{tx.sequenceNum}
                  </div>

                  {/* Timestamp */}
                  <div className="tabular-nums font-mono text-left" style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                  }} title={tx.postedAt}>
                    {formatTimestamp(tx.postedAt)}
                  </div>

                  {/* Status Badge */}
                  <div className="text-center">
                    <span className={`badge badge-${tx.status.toLowerCase()}`}>
                      {tx.status}
                    </span>
                  </div>

                  {/* Description & Multi-leg indicator */}
                  <div style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    paddingLeft: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}>
                    <span style={{ color: '#f1f5f9', fontWeight: 500, fontSize: '12px' }}>
                      {tx.description}
                    </span>
                    <span className="badge-currency font-mono" style={{ fontSize: '9px' }}>
                      {tx.postings.length} legs
                    </span>
                  </div>

                  {/* Amount (Strict Tabular Digits) */}
                  <div className="tabular-nums font-mono text-right" style={{
                    fontWeight: 700,
                    fontSize: '12px',
                    color: tx.status === 'VOIDED' ? '#94a3b8' : '#f8fafc',
                    paddingRight: '12px',
                  }}>
                    {formatMinor(tx.totalAmountMinor)}
                  </div>

                  {/* Transaction UUID */}
                  <div style={{ overflow: 'hidden' }}>
                    <span
                      className="hash-badge"
                      onClick={(e) => handleCopy(e, tx.id)}
                      title={`Click to copy UUID: ${tx.id}`}
                    >
                      {tx.id.slice(0, 8)}...
                    </span>
                  </div>

                  {/* Idempotency Key */}
                  <div style={{ overflow: 'hidden' }}>
                    <span
                      className="hash-badge"
                      style={{ color: '#cbd5e1' }}
                      onClick={(e) => handleCopy(e, tx.idempotencyKey)}
                      title={`Click to copy Idempotency Key: ${tx.idempotencyKey}`}
                    >
                      {tx.idempotencyKey.length > 14
                        ? `${tx.idempotencyKey.slice(0, 12)}..`
                        : tx.idempotencyKey}
                    </span>
                  </div>

                  {/* SHA-256 Hash */}
                  <div style={{ overflow: 'hidden' }}>
                    <span
                      className="hash-badge"
                      style={{ color: '#38bdf8' }}
                      onClick={(e) => handleCopy(e, tx.hash)}
                      title={`SHA-256 Hash: ${tx.hash}`}
                    >
                      {tx.hash.slice(0, 8)}..
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
};
