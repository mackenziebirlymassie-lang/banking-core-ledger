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
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '720px' }}>

        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={13} strokeWidth={1.5} style={{ color: 'var(--border-accent)' }} />
            <div>
              <span className="font-mono" style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-main)' }}>
                Account Statement & Running Balance
              </span>
              <span className="font-mono" style={{ fontSize: '10px', color: 'var(--border-accent)', marginLeft: '8px' }}>
                {account.accountNumber} • {account.type} ({account.currency})
              </span>
            </div>
          </div>

          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Balances Banner */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          padding: '8px 14px',
          background: 'var(--bg-canvas)',
          borderBottom: '1px solid var(--border-grid)',
        }}>
          <div>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Posted Balance</span>
            <div className="tabular-nums font-mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>
              {formatMinor(account.postedBalanceMinor, account.currency)}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Active Holds</span>
            <div className="tabular-nums font-mono" style={{ fontSize: '12px', fontWeight: 600, color: account.pendingBalanceMinor > 0 ? 'var(--acc-hold)' : 'var(--text-muted)' }}>
              {formatMinor(account.pendingBalanceMinor, account.currency)}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Available Balance</span>
            <div className="tabular-nums font-mono" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--acc-credit)' }}>
              {formatMinor(account.availableBalanceMinor, account.currency)}
            </div>
          </div>
        </div>

        {/* Modal Body: Running Balance Entries */}
        <div className="modal-body" style={{ padding: 0 }}>
          {isLoading ? (
            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              <RefreshCw size={13} strokeWidth={1.5} className="animate-spin" />
              <span>Loading ledger entries...</span>
            </div>
          ) : error ? (
            <div style={{ padding: '16px', color: 'var(--acc-debit)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              {error}
            </div>
          ) : !statement || statement.entries.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              No statement entries found for this account.
            </div>
          ) : (
            <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-elevated)', zIndex: 1 }}>
                  <tr style={{ borderBottom: '1px solid var(--border-grid)', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                    <th style={{ padding: '5px 8px', textAlign: 'right', width: '45px' }}>Seq #</th>
                    <th style={{ padding: '5px 8px', textAlign: 'left', width: '120px' }}>Date / Time</th>
                    <th style={{ padding: '5px 8px', textAlign: 'left' }}>Description</th>
                    <th style={{ padding: '5px 8px', textAlign: 'center', width: '50px' }}>Leg</th>
                    <th style={{ padding: '5px 8px', textAlign: 'right', width: '90px' }}>Amount</th>
                    <th style={{ padding: '5px 8px', textAlign: 'right', width: '100px' }}>Running Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.entries.map((entry) => {
                    const isDebit = entry.direction === 'DEBIT';

                    return (
                      <tr key={entry.postingId} style={{ borderBottom: '1px solid var(--border-grid)' }}>
                        <td className="tabular-nums font-mono text-right" style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>
                          #{entry.sequenceNum}
                        </td>
                        <td className="tabular-nums font-mono" style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>
                          {entry.postedAt ? entry.postedAt.replace('T', ' ').slice(0, 19) : ''}
                        </td>
                        <td style={{ padding: '5px 8px', color: 'var(--text-main)' }}>
                          {entry.description}
                        </td>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                          <span className={`badge-dir badge-dir-${isDebit ? 'dr' : 'cr'}`}>
                            {isDebit ? 'DR' : 'CR'}
                          </span>
                        </td>
                        <td className="tabular-nums font-mono text-right" style={{
                          padding: '5px 8px',
                          color: isDebit ? 'var(--acc-debit)' : 'var(--acc-credit)',
                          fontWeight: 600,
                        }}>
                          {isDebit ? '-' : '+'}{formatMinor(entry.amountMinor, account.currency)}
                        </td>
                        <td className="tabular-nums font-mono text-right" style={{
                          padding: '5px 8px',
                          color: entry.runningBalanceMinor < 0 ? 'var(--acc-debit)' : 'var(--text-main)',
                          fontWeight: 600,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {statement && (() => {
              const totalPages = Math.max(1, Math.ceil(statement.totalEntries / statement.pageSize));
              return (
                <span>
                  Page {statement.page} of {totalPages} ({statement.totalEntries} entries)
                </span>
              );
            })()}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              style={{ height: '24px', padding: '0 6px' }}
            >
              <ChevronLeft size={11} strokeWidth={1.5} /> Prev
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => setPage(p => p + 1)}
              disabled={!statement || page >= Math.max(1, Math.ceil(statement.totalEntries / statement.pageSize)) || isLoading}
              style={{ height: '24px', padding: '0 6px' }}
            >
              Next <ChevronRight size={11} strokeWidth={1.5} />
            </button>

            <button
              className="btn btn-primary"
              onClick={onClose}
              style={{ height: '24px', padding: '0 8px' }}
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
