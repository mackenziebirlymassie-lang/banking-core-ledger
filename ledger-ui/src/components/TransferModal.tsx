import React, { useState } from 'react';
import {
  X,
  ArrowRightLeft,
  Shield,
  Plus,
  Trash2,
  RefreshCw,
  Repeat,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import type { Account, Direction, PostingLegPayload, Transaction } from '../types/ledger';
import { calculateLegsBalance, formatMinor, parseToMinor } from '../utils/money';
import { LedgerApi } from '../services/api';

interface TransferModalProps {
  accounts: Account[];
  isOpen: boolean;
  onClose: () => void;
  onTransferSuccess: (transaction: Transaction) => void;
}

type TransferMode = 'SIMPLE' | 'MULTI_LEG' | 'HOLD';

interface DynamicLeg {
  id: string;
  accountId: string;
  direction: Direction;
  amountStr: string;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  accounts,
  isOpen,
  onClose,
  onTransferSuccess,
}) => {
  const [mode, setMode] = useState<TransferMode>('SIMPLE');
  const [sourceAccountId, setSourceAccountId] = useState<string>(accounts[0]?.id || '');
  const [destAccountId, setDestAccountId] = useState<string>(accounts[1]?.id || '');
  const [amountStr, setAmountStr] = useState<string>('150.00');
  const [description, setDescription] = useState<string>('Treasury liquidity reallocation');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ tx: Transaction; status: number } | null>(null);

  // Multi-leg state
  const [legs, setLegs] = useState<DynamicLeg[]>([
    { id: '1', accountId: accounts[0]?.id || '', direction: 'DEBIT', amountStr: '150.00' },
    { id: '2', accountId: accounts[1]?.id || '', direction: 'CREDIT', amountStr: '150.00' },
  ]);

  if (!isOpen) return null;

  const handleRegenerateKey = () => {
    setIdempotencyKey(crypto.randomUUID());
    setLastResult(null);
  };

  const handleAddLeg = () => {
    setLegs(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        accountId: accounts[0]?.id || '',
        direction: prev.length % 2 === 0 ? 'DEBIT' : 'CREDIT',
        amountStr: '50.00',
      },
    ]);
  };

  const handleRemoveLeg = (id: string) => {
    if (legs.length <= 2) return;
    setLegs(prev => prev.filter(l => l.id !== id));
  };

  const handleLegChange = (id: string, field: keyof DynamicLeg, value: any) => {
    setLegs(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  // Live balance validation for multi-leg
  const computedLegsForBalance = legs.map(l => ({
    direction: l.direction,
    amountMinor: parseToMinor(l.amountStr),
  }));
  const balanceInfo = calculateLegsBalance(computedLegsForBalance);

  const handleSubmit = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      if (mode === 'SIMPLE') {
        const amountMinor = parseToMinor(amountStr);
        if (amountMinor <= 0) {
          throw new Error('Transfer amount must be strictly greater than $0.00');
        }
        if (sourceAccountId === destAccountId) {
          throw new Error('Source and destination accounts must be distinct');
        }

        const res = await LedgerApi.executeTransfer({
          sourceAccountId,
          destinationAccountId: destAccountId,
          amountMinor,
          description,
        }, idempotencyKey);

        setLastResult({ tx: res.transaction, status: res.status });
        onTransferSuccess(res.transaction);
      } else if (mode === 'HOLD') {
        const amountMinor = parseToMinor(amountStr);
        if (amountMinor <= 0) {
          throw new Error('Hold amount must be strictly greater than $0.00');
        }
        if (sourceAccountId === destAccountId) {
          throw new Error('Source and escrow/destination accounts must be distinct');
        }

        const res = await LedgerApi.authorizeHold({
          sourceAccountId,
          destinationAccountId: destAccountId,
          amountMinor,
          description,
        }, idempotencyKey);

        setLastResult({ tx: res.transaction, status: res.status });
        onTransferSuccess(res.transaction);
      } else if (mode === 'MULTI_LEG') {
        if (!balanceInfo.isBalanced) {
          throw new Error(`Double-entry invariant violated: Discrepancy of ${balanceInfo.diffFormatted}. Debits must exactly equal Credits.`);
        }

        const legPayloads: PostingLegPayload[] = legs.map(l => ({
          accountId: l.accountId,
          amountMinor: parseToMinor(l.amountStr),
          direction: l.direction,
        }));

        const res = await LedgerApi.executeTransfer({
          legs: legPayloads,
          description,
        }, idempotencyKey);

        setLastResult({ tx: res.transaction, status: res.status });
        onTransferSuccess(res.transaction);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Transfer failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>

        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowRightLeft size={16} style={{ color: '#38bdf8' }} />
            <span style={{ fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Double-Entry Transfer & Hold Builder
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        {/* Mode Switcher */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-app)',
          padding: '0 20px',
        }}>
          {(['SIMPLE', 'MULTI_LEG', 'HOLD'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setLastResult(null); setErrorMessage(null); }}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${mode === m ? '#38bdf8' : 'transparent'}`,
                padding: '10px 14px',
                color: mode === m ? '#38bdf8' : 'var(--text-muted)',
                fontWeight: 600,
                fontSize: '11px',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {m === 'SIMPLE' && 'Simple Transfer (2 Legs)'}
              {m === 'MULTI_LEG' && 'Multi-Leg Balanced Transfer'}
              {m === 'HOLD' && 'Two-Phase Authorization Hold'}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="modal-body">

          {/* Idempotency Key Bar with Replay Demo */}
          <div style={{
            background: 'var(--bg-app)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Shield size={13} style={{ color: '#38bdf8' }} />
                <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                  Idempotency-Key Header
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  type="button"
                  onClick={handleRegenerateKey}
                  className="btn btn-secondary"
                  style={{ padding: '2px 6px', fontSize: '10px', height: '22px', gap: '4px' }}
                  title="Generate a fresh random UUID key"
                >
                  <RefreshCw size={10} /> New Key
                </button>
              </div>
            </div>

            <input
              type="text"
              value={idempotencyKey}
              onChange={e => setIdempotencyKey(e.target.value)}
              className="input font-mono tabular-nums"
              style={{ fontSize: '11px', color: '#7dd3fc' }}
              placeholder="e.g. transfer-req-849202"
            />
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.4)',
              borderRadius: '6px',
              padding: '10px 12px',
              color: '#fb7185',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <AlertTriangle size={15} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Result Banner with HTTP 201 Created vs 200 OK Replay */}
          {lastResult && (
            <div style={{
              background: lastResult.status === 200 ? 'rgba(56, 189, 248, 0.12)' : 'rgba(16, 185, 129, 0.12)',
              border: `1px solid ${lastResult.status === 200 ? 'rgba(56, 189, 248, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
              borderRadius: '6px',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={14} style={{ color: lastResult.status === 200 ? '#38bdf8' : '#34d399' }} />
                  <span style={{ fontWeight: 700, fontSize: '12px', color: lastResult.status === 200 ? '#38bdf8' : '#34d399' }}>
                    {lastResult.status === 200 ? 'HTTP 200 OK — Idempotent Replay (No Double Spend)' : 'HTTP 201 Created — Committed Double-Entry'}
                  </span>
                </div>
                <span className="badge badge-verified">
                  Seq #{lastResult.tx.sequenceNum}
                </span>
              </div>
              <div className="font-mono tabular-nums" style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Hash: {lastResult.tx.hash.slice(0, 16)}... | Amount: {formatMinor(lastResult.tx.totalAmountMinor)}
              </div>
            </div>
          )}

          {/* Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase' }}>
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="input"
              placeholder="e.g. Card checkout settlement or Treasury sweep"
            />
          </div>

          {/* Mode 1 & 3: Simple Transfer or Hold */}
          {(mode === 'SIMPLE' || mode === 'HOLD') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase' }}>
                    {mode === 'HOLD' ? 'Source Account (Payer)' : 'Source Account'}
                  </label>
                  <select
                    value={sourceAccountId}
                    onChange={e => setSourceAccountId(e.target.value)}
                    className="select font-mono"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountNumber} ({formatMinor(acc.availableBalanceMinor)})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase' }}>
                    {mode === 'HOLD' ? 'Escrow / Destination' : 'Destination Account'}
                  </label>
                  <select
                    value={destAccountId}
                    onChange={e => setDestAccountId(e.target.value)}
                    className="select font-mono"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountNumber} ({formatMinor(acc.availableBalanceMinor)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Amount ($ USD)
                </label>
                <input
                  type="text"
                  value={amountStr}
                  onChange={e => setAmountStr(e.target.value)}
                  className="input font-mono tabular-nums"
                  placeholder="150.00"
                  style={{ fontSize: '13px', fontWeight: 600 }}
                />
              </div>
            </div>
          )}

          {/* Mode 2: Multi-Leg Dynamic Builder */}
          {mode === 'MULTI_LEG' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                  Posting Legs (Must balance to $0.00)
                </span>
                <button
                  type="button"
                  onClick={handleAddLeg}
                  className="btn btn-secondary"
                  style={{ padding: '2px 8px', fontSize: '10px', height: '22px', gap: '4px' }}
                >
                  <Plus size={10} /> Add Leg
                </button>
              </div>

              {legs.map((leg) => (
                <div
                  key={leg.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '85px 1fr 110px 30px',
                    gap: '8px',
                    alignItems: 'center',
                    background: 'var(--bg-app)',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <select
                    value={leg.direction}
                    onChange={e => handleLegChange(leg.id, 'direction', e.target.value)}
                    className="select font-mono"
                    style={{
                      fontSize: '11px',
                      color: leg.direction === 'DEBIT' ? '#fb7185' : '#34d399',
                      fontWeight: 600,
                    }}
                  >
                    <option value="DEBIT">DEBIT</option>
                    <option value="CREDIT">CREDIT</option>
                  </select>

                  <select
                    value={leg.accountId}
                    onChange={e => handleLegChange(leg.id, 'accountId', e.target.value)}
                    className="select font-mono"
                    style={{ fontSize: '11px' }}
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountNumber} ({acc.currency})
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={leg.amountStr}
                    onChange={e => handleLegChange(leg.id, 'amountStr', e.target.value)}
                    className="input font-mono tabular-nums text-right"
                    style={{ fontSize: '11px', fontWeight: 600 }}
                    placeholder="0.00"
                  />

                  {legs.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveLeg(leg.id)}
                      style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: 0 }}
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : <div />}
                </div>
              ))}

              {/* Invariant Bar */}
              <div style={{
                background: balanceInfo.isBalanced ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.12)',
                border: `1px solid ${balanceInfo.isBalanced ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.4)'}`,
                borderRadius: '4px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', gap: '14px', fontSize: '11px' }}>
                  <span className="tabular-nums font-mono">
                    Debits: <strong style={{ color: '#fb7185' }}>{balanceInfo.totalDebitsFormatted}</strong>
                  </span>
                  <span className="tabular-nums font-mono">
                    Credits: <strong style={{ color: '#34d399' }}>{balanceInfo.totalCreditsFormatted}</strong>
                  </span>
                </div>

                <span className="tabular-nums font-mono" style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: balanceInfo.isBalanced ? '#34d399' : '#fb7185',
                }}>
                  {balanceInfo.isBalanced ? 'BALANCED ($0.00) ✓' : `IMBALANCE: ${balanceInfo.diffFormatted} ✗`}
                </span>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          {/* Replay Demonstration button */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSubmit}
            disabled={isSubmitting}
            title="Send the exact same idempotency key to test deduplication"
          >
            <Repeat size={12} />
            Replay Same Idempotency Key
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={isSubmitting || (mode === 'MULTI_LEG' && !balanceInfo.isBalanced)}
          >
            {isSubmitting ? (
              <>
                <RefreshCw size={12} className="animate-spin" />
                Committing...
              </>
            ) : mode === 'HOLD' ? 'Authorize Two-Phase Hold' : 'Commit Transfer'}
          </button>
        </div>

      </div>
    </div>
  );
};
