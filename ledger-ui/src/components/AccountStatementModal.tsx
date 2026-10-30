import React, { useEffect, useState } from 'react';
import {
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import type { Account, AccountStatement } from '../types/ledger';
import { formatMinor } from '../utils/money';
import { ledgerClient } from '../api/LedgerClient';

interface AccountStatementModalProps {
  account: Account | null;
  isOpen: boolean;
  onClose: () => void;
}

export const AccountStatementModal: React.FC<AccountStatementModalProps> = ({
  account,
  isOpen,
  onClose,
}) => {
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [page, setPage] = useState<number>(1);
  const [pageSize] = useState<number>(20);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && account) {
      loadStatement(account.id, page);
    } else {
      setStatement(null);
      setPage(1);
    }
  }, [isOpen, account, page]);

  const loadStatement = async (accId: string, pageNum: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await ledgerClient.getAccountStatement(accId, pageNum, pageSize);
      setStatement(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch statement');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen || !account) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '780px' }}>

        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} style={{ color: '#38bdf8' }} />
            <div>
              <span style={{ fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Account Statement & Running Balance
              </span>
              <div className="font-mono" style={{ fontSize: '11px', color: '#7dd3fc' }}>
                {account.accountNumber} • {account.type} ({account.currency})
              </div>
            </div>
          </div>

          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Balances Banner */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          padding: '12px 20px',
          background: 'var(--bg-app)',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Posted Balance</span>
            <div className="tabular-nums font-mono" style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
              {formatMinor(account.postedBalanceMinor, account.currency)}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Active Holds</span>
            <div className="tabular-nums font-mono" style={{ fontSize: '14px', fontWeight: 600, color: account.pendingBalanceMinor > 0 ? '#fbbf24' : 'var(--text-dim)' }}>
              {formatMinor(account.pendingBalanceMinor, account.currency)}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Available Balance</span>
            <div className="tabular-nums font-mono" style={{ fontSize: '14px', fontWeight: 700, color: '#34d399' }}>
              {formatMinor(account.availableBalanceMinor, account.currency)}
            </div>
          </div>
        </div>

        {/* Modal Body: Running Balance Entries */}
        <div className="modal-body" style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-dim)' }}>
              <RefreshCw size={16} className="animate-spin" />
              <span>Loading ledger entries...</span>
            </div>
          ) : error ? (
            <div style={{ padding: '20px', color: '#fb7185' }}>
              {error}
            </div>
          ) : !statement || statement.entries.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-dim)' }}>
              No statement entries found for this account.
            </div>
          ) : (
            <div style={{ maxHeight: '380px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#0a101f', zIndex: 1 }}>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'right', width: '50px' }}>Seq #</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', width: '140px' }}>Date / Time</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Description</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', width: '70px' }}>Leg</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', width: '100px' }}>Amount</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', width: '120px' }}>Running Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.entries.map((entry) => {
                    const isDebit = entry.direction === 'DEBIT';

                    return (
                      <tr key={entry.postingId} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td className="tabular-nums font-mono text-right" style={{ padding: '8px 12px', color: 'var(--text-dim)' }}>
                          #{entry.sequenceNum}
                        </td>
                        <td className="tabular-nums font-mono" style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                          {entry.postedAt ? entry.postedAt.replace('T', ' ').slice(0, 19) : ''}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#f1f5f9' }}>
                          {entry.description}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <span className={`badge badge-${isDebit ? 'debit' : 'credit'}`} style={{ fontSize: '10px' }}>
                            {entry.direction}
                          </span>
                        </td>
                        <td className="tabular-nums font-mono text-right" style={{
                          padding: '8px 12px',
                          fontWeight: 600,
                          color: isDebit ? '#fb7185' : '#34d399',
                        }}>
                          {isDebit ? '-' : '+'}{formatMinor(entry.amountMinor, account.currency)}
                        </td>
                        <td className="tabular-nums font-mono text-right" style={{
                          padding: '8px 12px',
                          fontWeight: 700,
                          color: '#f8fafc',
                        }}>
                          {formatMinor(entry.runningBalanceMinor, account.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Footer with Pagination */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            Page {page} • Entries: {statement?.entries.length || 0}
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className="btn btn-secondary"
              style={{ padding: '4px 8px', fontSize: '11px', height: '28px' }}
            >
              <ChevronLeft size={13} /> Prev
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!statement || statement.entries.length < pageSize || isLoading}
              className="btn btn-secondary"
              style={{ padding: '4px 8px', fontSize: '11px', height: '28px' }}
            >
              Next <ChevronRight size={13} />
            </button>
            <button
              onClick={onClose}
              className="btn btn-primary"
              style={{ padding: '4px 12px', fontSize: '11px', height: '28px' }}
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
