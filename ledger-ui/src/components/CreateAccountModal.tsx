import React, { useState } from 'react';
import {
  X,
  Building,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import type { Account, AccountType } from '../types/ledger';
import { ledgerClient } from '../api/LedgerClient';

interface CreateAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountCreated: (account: Account) => void;
}

export const CreateAccountModal: React.FC<CreateAccountModalProps> = ({
  isOpen,
  onClose,
  onAccountCreated,
}) => {
  const [accountNumber, setAccountNumber] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [type, setType] = useState<AccountType>('LIABILITY');
  const [allowNegativeBalance, setAllowNegativeBalance] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountNumber.trim()) {
      setError('Account Number is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const created = await ledgerClient.createAccount({
        accountNumber: accountNumber.trim().toUpperCase(),
        currency: currency.trim().toUpperCase(),
        type,
        allowNegativeBalance,
      });

      onAccountCreated(created);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>

        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Building size={13} strokeWidth={1.5} style={{ color: 'var(--border-accent)' }} />
            <span className="font-mono" style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-main)' }}>
              Create Institutional Account
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div style={{
                background: 'var(--acc-debit-bg)',
                border: '1px solid var(--acc-debit-border)',
                borderRadius: '2px',
                padding: '6px 10px',
                color: 'var(--acc-debit)',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}>
                <AlertTriangle size={13} strokeWidth={1.5} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                Account Identifier
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={e => setAccountNumber(e.target.value)}
                placeholder="e.g. MERCHANT-SHOPIFY-PAY or RESERVE-EUR-001"
                className="input font-mono"
                style={{ textTransform: 'uppercase' }}
                autoFocus
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                  Account Type
                </label>
                <select
                  value={type}
                  onChange={e => setType(e.target.value as AccountType)}
                  className="select font-mono"
                >
                  <option value="ASSET">ASSET</option>
                  <option value="LIABILITY">LIABILITY</option>
                  <option value="EQUITY">EQUITY</option>
                  <option value="REVENUE">REVENUE</option>
                  <option value="EXPENSE">EXPENSE</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                  Currency (ISO-4217)
                </label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="select font-mono"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="JPY">JPY (¥)</option>
                  <option value="CAD">CAD (C$)</option>
                </select>
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-canvas)',
              padding: '8px 10px',
              borderRadius: '2px',
              border: '1px solid var(--border-grid)',
            }}>
              <input
                type="checkbox"
                id="allowNeg"
                checked={allowNegativeBalance}
                onChange={e => setAllowNegativeBalance(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="allowNeg" style={{ fontSize: '10px', color: 'var(--text-secondary)', cursor: 'pointer', lineHeight: 1.3 }}>
                Allow negative balance (e.g. Treasury Central Liquidity / Clearing)
              </label>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={11} strokeWidth={1.5} className="animate-spin" />
                  <span>Creating...</span>
                </>
              ) : 'Create Account'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
