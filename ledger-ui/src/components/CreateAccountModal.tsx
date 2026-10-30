import React, { useState } from 'react';
import {
  X,
  PlusCircle,
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
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>

        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PlusCircle size={16} style={{ color: '#38bdf8' }} />
            <span style={{ fontWeight: 700, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Create Institutional Account
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div style={{
                background: 'rgba(244, 63, 94, 0.12)',
                border: '1px solid rgba(244, 63, 94, 0.4)',
                borderRadius: '4px',
                padding: '8px 12px',
                color: '#fb7185',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <AlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase' }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase' }}>
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase' }}>
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
              gap: '8px',
              background: 'var(--bg-app)',
              padding: '10px 12px',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
            }}>
              <input
                type="checkbox"
                id="allowNeg"
                checked={allowNegativeBalance}
                onChange={e => setAllowNegativeBalance(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="allowNeg" style={{ fontSize: '11px', color: '#cbd5e1', cursor: 'pointer', lineHeight: 1.3 }}>
                <strong>Allow Negative Balance (Overdraft / Central Liquidity)</strong>
                <div style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                  Only enabled for central reserve or liquidity faucet accounts.
                </div>
              </label>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <RefreshCw size={12} className="animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
