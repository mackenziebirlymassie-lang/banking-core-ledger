import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Check,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import type { AuditReport } from '../types/ledger';

interface AuditReportModalProps {
  report: AuditReport | null;
  isOpen: boolean;
  onClose: () => void;
  onReverify: () => void;
  isLoading: boolean;
}

export const AuditReportModal: React.FC<AuditReportModalProps> = ({
  report,
  isOpen,
  onClose,
  onReverify,
  isLoading,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '620px' }}>

        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={14} strokeWidth={1.5} style={{ color: report?.valid ? 'var(--acc-credit)' : 'var(--acc-debit)' }} />
            <div>
              <span className="font-mono" style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-main)' }}>
                Cryptographic SHA-256 Audit Verification
              </span>
            </div>
          </div>

          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {isLoading ? (
            <div style={{ height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              <RefreshCw size={14} strokeWidth={1.5} className="animate-spin" />
              <span>Verifying cryptographic SHA-256 Merkle chain against WAL...</span>
            </div>
          ) : !report ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              No audit report available. Click Re-verify to scan.
            </div>
          ) : (
            <>
              {/* Overall Status Banner */}
              <div style={{
                background: report.valid ? 'var(--acc-credit-bg)' : 'var(--acc-debit-bg)',
                border: `1px solid ${report.valid ? 'var(--acc-credit-border)' : 'var(--acc-debit-border)'}`,
                borderRadius: '2px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {report.valid ? (
                    <CheckCircle2 size={16} strokeWidth={1.5} style={{ color: 'var(--acc-credit)' }} />
                  ) : (
                    <AlertTriangle size={16} strokeWidth={1.5} style={{ color: 'var(--acc-debit)' }} />
                  )}
                  <div>
                    <div className="font-mono" style={{ fontWeight: 700, fontSize: '12px', color: report.valid ? 'var(--acc-credit)' : 'var(--acc-debit)' }}>
                      {report.valid ? 'Cryptographic Hash Chain Verified ✓' : 'CHAIN TAMPER DETECTED ✗'}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                      {report.valid
                        ? `All ${report.totalTransactionsScanned} transactions are cryptographically linked and verified.`
                        : `Tamper detected at sequence #${report.corruptedSequenceNum}: ${report.failureReason}`}
                    </div>
                  </div>
                </div>

                <div className="tabular-nums font-mono text-right" style={{ fontSize: '11px', color: 'var(--border-accent)', fontWeight: 600 }}>
                  {report.executionTimeMs} ms
                </div>
              </div>

              {/* Merkle Root & Hash Linkages */}
              <div style={{
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-grid)',
                borderRadius: '2px',
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}>
                {/* Merkle Root */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                    Merkle Tree Root Hash
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
                    <span className="font-mono tabular-nums" style={{ fontSize: '10px', color: 'var(--border-accent)', wordBreak: 'break-all' }}>
                      {report.merkleRoot}
                    </span>
                    <button
                      onClick={() => handleCopy('merkle', report.merkleRoot)}
                      style={{ background: 'none', border: 'none', color: copiedKey === 'merkle' ? 'var(--acc-credit)' : 'var(--text-muted)', cursor: 'pointer', paddingLeft: '4px' }}
                    >
                      {copiedKey === 'merkle' ? <Check size={11} strokeWidth={2} /> : <Copy size={11} strokeWidth={1.5} />}
                    </button>
                  </div>
                </div>

                {/* Latest Block Hash */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                    Latest Block Hash
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
                    <span className="font-mono tabular-nums" style={{ fontSize: '10px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                      {report.latestHash}
                    </span>
                    <button
                      onClick={() => handleCopy('blockHash', report.latestHash)}
                      style={{ background: 'none', border: 'none', color: copiedKey === 'blockHash' ? 'var(--acc-credit)' : 'var(--text-muted)', cursor: 'pointer', paddingLeft: '4px' }}
                    >
                      {copiedKey === 'blockHash' ? <Check size={11} strokeWidth={2} /> : <Copy size={11} strokeWidth={1.5} />}
                    </button>
                  </div>
                </div>

                {/* Scanned Blocks Count */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '2px' }}>
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                    Verified Block Count:
                  </span>
                  <span className="font-mono tabular-nums" style={{ fontSize: '11px', color: 'var(--text-main)', fontWeight: 600 }}>
                    {report.totalTransactionsScanned} transactions
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onReverify}
            disabled={isLoading}
          >
            <RefreshCw size={11} strokeWidth={1.5} className={isLoading ? 'animate-spin' : ''} />
            <span>Re-Verify Chain</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
