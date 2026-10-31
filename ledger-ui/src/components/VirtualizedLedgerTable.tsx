import React, { useRef, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Search,
  X
} from 'lucide-react';
import type { Transaction, TransferStatus } from '../types/ledger';
import { formatMinor, formatTimestamp } from '../utils/money';
import { useSettings } from '../settings/SettingsContext';
import { playTick } from '../utils/terminalAudio';

export interface VirtualizedLedgerTableHandle {
  focusSearch: () => void;
}

interface VirtualizedLedgerTableProps {
  transactions: Transaction[];
  selectedTransactionId: string | null;
  onSelectTransaction: (transaction: Transaction) => void;
  filteredAccountId: string | null;
  onClearAccountFilter: () => void;
}


export const VirtualizedLedgerTable = forwardRef<VirtualizedLedgerTableHandle, VirtualizedLedgerTableProps>(({
  transactions,
  selectedTransactionId,
  onSelectTransaction,
  filteredAccountId,
  onClearAccountFilter,
}, ref) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TransferStatus>('ALL');

  useImperativeHandle(ref, () => ({
    focusSearch: () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    },
  }));

  const handleCopy = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
  };

  // High-performance filter
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

  const { settings } = useSettings();
  const rowHeight = settings.densityMode === 'COMPACT' ? 36 : 44;

  // Viewport Virtualization with dynamic row height based on density setting
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 25,
  });

  return (
    <main style={{
      flex: 1,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-canvas)',
      overflow: 'hidden',
    }}>
      {/* 34px Table Control & Filter Header */}
      <div style={{
        height: '48px',
        padding: '0 24px',
        borderBottom: '1px solid var(--border-grid)',
        background: 'var(--bg-elevated)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        flexShrink: 0,
      }}>
        {/* Search & Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border-grid)',
            borderRadius: '2px',
            padding: '4px 10px',
            maxWidth: '340px',
            height: '32px',
            width: '100%',
          }}>
            <Search size={11} strokeWidth={1.5} style={{ color: 'var(--text-muted)' }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search journal (/)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-main)',
                fontSize: '12px',
                width: '100%',
                fontFamily: 'var(--font-mono)',
              }}
            />
            {searchTerm ? (
              <button
                onClick={() => setSearchTerm('')}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
              >
                <X size={11} strokeWidth={1.5} />
              </button>
            ) : (
              <kbd>/</kbd>
            )}
          </div>

          {/* Status Segment Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            {(['ALL', 'POSTED', 'PENDING', 'VOIDED'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className="btn"
                style={{
                  padding: '2px 10px',
                  fontSize: '11px',
                  height: '26px',
                  fontFamily: 'var(--font-mono)',
                  background: statusFilter === status ? 'var(--bg-selected)' : 'transparent',
                  borderColor: statusFilter === status ? 'var(--border-strong)' : 'transparent',
                  color: statusFilter === status ? '#38bdf8' : 'var(--text-muted)',
                }}
              >
                {status}
              </button>
            ))}
          </div>

          {/* Filtered by Account Chip */}
          {filteredAccountId && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '1px 6px',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '2px',
              color: 'var(--border-accent)',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)'
            }}>
              <span>Filtered Account</span>
              <button
                onClick={onClearAccountFilter}
                style={{ background: 'none', border: 'none', color: 'var(--border-accent)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <X size={10} strokeWidth={1.5} />
              </button>
            </div>
          )}
        </div>

        {/* Row count stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          <span className="tabular-nums">
            {filtered.length} of {transactions.length} ROWS
          </span>
          <span style={{ color: 'var(--border-grid)' }}>|</span>
          <span style={{ color: 'var(--text-secondary)' }}>
            VIRTUALIZED (60 FPS)
          </span>
        </div>
      </div>

      {/* Fixed Grid Header with 100% pixel-aligned columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '65px 115px 85px 1fr 60px 140px 140px 95px',
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-grid)',
        fontSize: '11px',
        fontWeight: 600,
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        padding: '0 24px',
        height: '32px',
        alignItems: 'center',
        flexShrink: 0,
        userSelect: 'none',
      }}>
        <div className="tabular-nums text-right" style={{ paddingRight: '6px' }}>SEQ #</div>
        <div className="text-left font-mono">{settings.timeDisplay} TIME</div>
        <div className="text-center">STATUS</div>
        <div className="text-left" style={{ paddingLeft: '6px' }}>DESCRIPTION</div>
        <div className="text-center font-mono">LEGS</div>
        <div className="tabular-nums text-right font-mono" style={{ paddingRight: '8px' }}>AMOUNT</div>
        <div className="text-left font-mono">IDEMPOTENCY / ID</div>
        <div className="text-left font-mono">SHA-256</div>
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
            height: '180px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
          }}>
            <Search size={18} strokeWidth={1.5} style={{ opacity: 0.3 }} />
            <span>No journal entries match the filter criteria</span>
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
                  onClick={() => {
                    onSelectTransaction(tx);
                    playTick(settings.audioFeedback);
                  }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    display: 'grid',
                    gridTemplateColumns: '65px 115px 85px 1fr 60px 140px 140px 95px',
                    alignItems: 'center',
                    padding: '0 24px',
                    borderBottom: '1px solid var(--border-grid)',
                    borderLeft: isSelected ? '2px solid var(--border-accent)' : '2px solid transparent',
                    background: isSelected
                      ? 'var(--bg-selected)'
                      : virtualRow.index % 2 === 0
                        ? 'var(--bg-canvas)'
                        : 'var(--bg-panel)',
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'background 0.05s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background =
                        virtualRow.index % 2 === 0 ? 'var(--bg-canvas)' : 'var(--bg-panel)';
                    }
                  }}
                >
                  {/* Sequence # */}
                  <div className="tabular-nums font-mono text-right" style={{
                    color: isSelected ? 'var(--border-accent)' : 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: '13px',
                    paddingRight: '12px',
                  }}>
                    #{tx.sequenceNum}
                  </div>

                  {/* Timestamp */}
                  <div className="tabular-nums font-mono text-left" style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }} title={tx.postedAt}>
                    {formatTimestamp(tx.postedAt, settings.timeDisplay)}
                  </div>

                  {/* Status Badge */}
                  <div className="text-center">
                    <span className={`badge badge-${tx.status.toLowerCase()}`}>
                      {tx.status}
                    </span>
                  </div>

                  {/* Description */}
                  <div style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    paddingLeft: '6px',
                    color: 'var(--text-main)',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    fontWeight: 500,
                  }}>
                    {tx.description}
                  </div>

                  {/* Legs count */}
                  <div className="text-center font-mono tabular-nums" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {tx.postings.length}
                  </div>

                  {/* Amount (Strict Tabular Digits) */}
                  <div className="tabular-nums font-mono text-right" style={{
                    fontWeight: 600,
                    fontSize: '13px',
                    color: tx.status === 'VOIDED' ? 'var(--text-muted)' : 'var(--text-main)',
                    paddingRight: '12px',
                  }}>
                    {formatMinor(
                      tx.totalAmountMinor,
                      tx.postings[0]?.currency || 'USD',
                      settings.currencyFormat,
                      settings.zeroStyle
                    )}
                  </div>

                  {/* Idempotency Key / UUID */}
                  <div style={{ overflow: 'hidden' }}>
                    <span
                      className="hash-badge"
                      onClick={(e) => handleCopy(e, tx.idempotencyKey)}
                      title={`Idempotency: ${tx.idempotencyKey}\nUUID: ${tx.id}`}
                    >
                      {tx.idempotencyKey.slice(0, 10)}..
                    </span>
                  </div>

                  {/* SHA-256 Hash */}
                  <div style={{ overflow: 'hidden' }}>
                    <span
                      className="hash-badge"
                      style={{ color: 'var(--border-accent)' }}
                      onClick={(e) => handleCopy(e, tx.hash)}
                      title={`SHA-256: ${tx.hash}`}
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
});
