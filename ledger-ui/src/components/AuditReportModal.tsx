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
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>

        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} style={{ color: report?.valid ? '#34d399' : '#fb7185' }} />
            <div>
              <span style={{ fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Tamper-Evident SHA-256 Audit Verification
              </span>
              <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                CRYPTOGRAPHIC PROOF & MERKLE INTEGRITY REPORT
              </div>
            </div>
          </div>

          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {isLoading ? (
            <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-dim)' }}>
              <RefreshCw size={18} className="animate-spin" />
              <span>Scanning ledger transaction chain and verifying binary WAL...</span>
            </div>
          ) : !report ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)' }}>
              No audit report available. Click Re-verify to scan.
            </div>
          ) : (
            <>
              {/* Overall Status Banner */}
              <div style={{
                background: report.valid ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.15)',
                border: `1px solid ${report.valid ? 'rgba(16, 185, 129, 0.4)' : 'rgba(244, 63, 94, 0.4)'}`,
                borderRadius: '6px',
                padding: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {report.valid ? (
                    <CheckCircle2 size={24} style={{ color: '#10b981' }} />
                  ) : (
                    <AlertTriangle size={24} style={{ color: '#f43f5e' }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: report.valid ? '#34d399' : '#fb7185' }}>
                      {report.valid ? 'Cryptographic Hash Chain Verified ✓' : 'CHAIN TAMPER DETECTED ✗'}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {report.valid
                        ? `All ${report.totalTransactionsScanned} transactions are cryptographically valid and tamper-free.`
                        : `Tamper detected at sequence #${report.corruptedSequenceNum}: ${report.failureReason}`}
                    </div>
                  </div>
                </div>

                <div className="tabular-nums font-mono text-right" style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 600 }}>
                  {report.executionTimeMs} ms
                </div>
              </div>

              {/* Merkle Root & Hash Linkages */}
              <div style={{
                background: 'var(--bg-app)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}>
                {/* Merkle Root */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Merkle Tree Root Hash
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
                    <span className="font-mono tabular-nums" style={{ fontSize: '11px', color: '#38bdf8', wordBreak: 'break-all' }}>
                      {report.merkleRoot}
                    </span>
                    <button
                      onClick={() => handleCopy('merkle', report.merkleRoot)}
                      style={{ background: 'none', border: 'none', color: copiedKey === 'merkle' ? '#34d399' : 'var(--text-dim)', cursor: 'pointer', paddingLeft: '6px' }}
                    >
                      {copiedKey === 'merkle' ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                {/* Latest Block Hash */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Latest Block Hash
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
                    <span className="font-mono tabular-nums" style={{ fontSize: '11px', color: '#cbd5e1', wordBreak: 'break-all' }}>
                      {report.latestHash}
                    </span>
                    <button
                      onClick={() => handleCopy('latest', report.latestHash)}
                      style={{ background: 'none', border: 'none', color: copiedKey === 'latest' ? '#34d399' : 'var(--text-dim)', cursor: 'pointer', paddingLeft: '6px' }}
                    >
                      {copiedKey === 'latest' ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>

                {/* Genesis Hash */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Genesis Block Link
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
                    <span className="font-mono tabular-nums" style={{ fontSize: '11px', color: '#94a3b8', wordBreak: 'break-all' }}>
                      {report.genesisHash}
                    </span>
                    <button
                      onClick={() => handleCopy('genesis', report.genesisHash)}
                      style={{ background: 'none', border: 'none', color: copiedKey === 'genesis' ? '#34d399' : 'var(--text-dim)', cursor: 'pointer', paddingLeft: '6px' }}
                    >
                      {copiedKey === 'genesis' ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Scanned Details Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '10px',
              }}>
                <div style={{ background: 'var(--bg-app)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Transactions</span>
                  <div className="tabular-nums font-mono" style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                    {report.totalTransactionsScanned}
                  </div>
                </div>
                <div style={{ background: 'var(--bg-app)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Verified At</span>
                  <div className="tabular-nums font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {report.verifiedAt ? report.verifiedAt.replace('T', ' ').slice(0, 19) : ''}
                  </div>
                </div>
                <div style={{ background: 'var(--bg-app)', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Audit Latency</span>
                  <div className="tabular-nums font-mono" style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8' }}>
                    {report.executionTimeMs} ms
                  </div>
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
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
            Re-verify Chain
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
          >
            Dismiss
          </button>
        </div>

      </div>
    </div>
  );
};
