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
import { ledgerClient } from '../api/LedgerClient';

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

        const res = await ledgerClient.executeTransfer({
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
          throw new Error('Source and destination accounts must be distinct');
        }

        const res = await ledgerClient.authorizeHold({
          sourceAccountId,
          destinationAccountId: destAccountId,
          amountMinor,
          description,
        }, idempotencyKey);

        setLastResult({ tx: res.transaction, status: res.status });
        onTransferSuccess(res.transaction);
      } else if (mode === 'MULTI_LEG') {
        if (!balanceInfo.isBalanced) {
          throw new Error(`Double-entry invariant violated: Discrepancy of ${balanceInfo.diffFormatted}. Debits must equal Credits.`);
        }

        const legPayloads: PostingLegPayload[] = legs.map(l => ({
          accountId: l.accountId,
          amountMinor: parseToMinor(l.amountStr),
          direction: l.direction,
        }));

        const res = await ledgerClient.executeTransfer({
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
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '620px' }}>

        {/* Modal Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowRightLeft size={13} strokeWidth={1.5} style={{ color: 'var(--border-accent)' }} />
            <span className="font-mono" style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-main)' }}>
              Double-Entry Transfer & Hold Builder
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Mode Switcher */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-grid)',
          background: 'var(--bg-canvas)',
          padding: '0 14px',
        }}>
          {(['SIMPLE', 'MULTI_LEG', 'HOLD'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setLastResult(null); setErrorMessage(null); }}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${mode === m ? 'var(--border-accent)' : 'transparent'}`,
                padding: '8px 12px',
                color: mode === m ? 'var(--border-accent)' : 'var(--text-muted)',
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

          {/* Idempotency Key Bar */}
          <div style={{
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border-grid)',
            borderRadius: '2px',
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Shield size={12} strokeWidth={1.5} style={{ color: 'var(--border-accent)' }} />
                <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Idempotency-Key Header
                </span>
              </div>
              <button
                type="button"
                onClick={handleRegenerateKey}
                className="btn btn-secondary"
                style={{ padding: '1px 5px', fontSize: '9px', height: '20px', gap: '3px' }}
                title="Generate fresh UUID"
              >
                <RefreshCw size={9} strokeWidth={1.5} /> New Key
              </button>
            </div>

            <input
              type="text"
              value={idempotencyKey}
              onChange={e => setIdempotencyKey(e.target.value)}
              className="input font-mono tabular-nums"
              style={{ fontSize: '10px', color: 'var(--border-accent)' }}
              placeholder="e.g. transfer-req-849202"
            />
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div style={{
              background: 'var(--acc-debit-bg)',
              border: '1px solid var(--acc-debit-border)',
              borderRadius: '2px',
              padding: '8px 10px',
              color: 'var(--acc-debit)',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <AlertTriangle size={13} strokeWidth={1.5} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Result Banner with HTTP 201 Created vs 200 OK Replay */}
          {lastResult && (
            <div style={{
              background: lastResult.status === 200 ? 'rgba(56, 189, 248, 0.1)' : 'var(--acc-credit-bg)',
              border: `1px solid ${lastResult.status === 200 ? 'rgba(56, 189, 248, 0.3)' : 'var(--acc-credit-border)'}`,
              borderRadius: '2px',
              padding: '8px 10px',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <CheckCircle2 size={13} strokeWidth={1.5} style={{ color: lastResult.status === 200 ? 'var(--border-accent)' : 'var(--acc-credit)' }} />
                  <span style={{ fontWeight: 600, fontSize: '11px', color: lastResult.status === 200 ? 'var(--border-accent)' : 'var(--acc-credit)', fontFamily: 'var(--font-mono)' }}>
                    {lastResult.status === 200 ? 'HTTP 200 OK — Idempotent Replay' : 'HTTP 201 Created — Committed Double-Entry'}
                  </span>
                </div>
                <span className="badge badge-verified">
                  Seq #{lastResult.tx.sequenceNum}
                </span>
              </div>
              <div className="font-mono tabular-nums" style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                Hash: {lastResult.tx.hash.slice(0, 16)}... | Total: {formatMinor(lastResult.tx.totalAmountMinor)}
              </div>
            </div>
          )}

          {/* Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                  Amount ($ USD)
                </label>
                <input
                  type="text"
                  value={amountStr}
                  onChange={e => setAmountStr(e.target.value)}
                  className="input font-mono tabular-nums"
                  placeholder="150.00"
                  style={{ fontSize: '12px', fontWeight: 600 }}
                />
              </div>
            </div>
          )}

          {/* Mode 2: Multi-Leg Dynamic Builder */}
          {mode === 'MULTI_LEG' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  Posting Legs (Must Balance to $0.00)
                </span>
                <button
                  type="button"
                  onClick={handleAddLeg}
                  className="btn btn-secondary"
                  style={{ padding: '1px 6px', fontSize: '9px', height: '20px', gap: '3px' }}
                >
                  <Plus size={9} strokeWidth={1.5} /> Add Leg
                </button>
              </div>

              {legs.map((leg) => (
                <div
                  key={leg.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '75px 1fr 100px 24px',
                    gap: '6px',
                    alignItems: 'center',
                    background: 'var(--bg-canvas)',
                    padding: '4px 6px',
                    borderRadius: '2px',
                    border: '1px solid var(--border-grid)',
                  }}
                >
                  <select
                    value={leg.direction}
                    onChange={e => handleLegChange(leg.id, 'direction', e.target.value)}
                    className="select font-mono"
                    style={{
                      fontSize: '10px',
                      color: leg.direction === 'DEBIT' ? 'var(--acc-debit)' : 'var(--acc-credit)',
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
                    style={{ fontSize: '10px' }}
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
                    style={{ fontSize: '10px', fontWeight: 600 }}
                    placeholder="0.00"
                  />

                  {legs.length > 2 ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveLeg(leg.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--acc-debit)', cursor: 'pointer', padding: 0 }}
                    >
                      <Trash2 size={11} strokeWidth={1.5} />
                    </button>
                  ) : <div />}
                </div>
              ))}

              {/* Invariant Bar */}
              <div style={{
                background: balanceInfo.isBalanced ? 'var(--acc-credit-bg)' : 'var(--acc-debit-bg)',
                border: `1px solid ${balanceInfo.isBalanced ? 'var(--acc-credit-border)' : 'var(--acc-debit-border)'}`,
                borderRadius: '2px',
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', gap: '10px', fontSize: '10px' }}>
                  <span className="tabular-nums font-mono">
                    DR: <strong style={{ color: 'var(--acc-debit)' }}>{balanceInfo.totalDebitsFormatted}</strong>
                  </span>
                  <span className="tabular-nums font-mono">
                    CR: <strong style={{ color: 'var(--acc-credit)' }}>{balanceInfo.totalCreditsFormatted}</strong>
                  </span>
                </div>

                <span className="tabular-nums font-mono" style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: balanceInfo.isBalanced ? 'var(--acc-credit)' : 'var(--acc-debit)',
                }}>
                  {balanceInfo.isBalanced ? 'BALANCED ($0.00) ✓' : `IMBALANCE: ${balanceInfo.diffFormatted} ✗`}
                </span>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSubmit}
            disabled={isSubmitting}
            title="Send the exact same idempotency key to test deduplication"
          >
            <Repeat size={11} strokeWidth={1.5} />
            <span>Replay Key Test</span>
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
                <RefreshCw size={11} strokeWidth={1.5} className="animate-spin" />
                <span>Committing...</span>
              </>
            ) : mode === 'HOLD' ? 'Authorize Hold' : 'Commit Transfer'}
          </button>
        </div>

      </div>
    </div>
  );
};
