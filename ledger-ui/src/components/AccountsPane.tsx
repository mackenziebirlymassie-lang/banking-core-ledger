import React, { useState } from 'react';
import {
  Search,
  FileText,
  X,
  CreditCard,
  Building,
  Wallet,
  TrendingUp,
  Landmark,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import type { Account, AccountType } from '../types/ledger';
import { formatMinor } from '../utils/money';
import { useSettings } from '../settings/SettingsContext';

interface AccountsPaneProps {
  accounts: Account[];
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string | null) => void;
  onOpenStatement: (account: Account) => void;
}

const CATEGORY_META: Record<AccountType, { label: string; icon: React.FC<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>; normalDir: 'DR' | 'CR'; color: string }> = {
  ASSET: { label: 'Assets', icon: Landmark, normalDir: 'DR', color: '#38bdf8' },
  LIABILITY: { label: 'Liabilities', icon: Wallet, normalDir: 'CR', color: '#f59e0b' },
  EQUITY: { label: 'Equity', icon: Building, normalDir: 'CR', color: '#a78bfa' },
  REVENUE: { label: 'Revenue', icon: TrendingUp, normalDir: 'CR', color: '#10b981' },
  EXPENSE: { label: 'Expenses', icon: CreditCard, normalDir: 'DR', color: '#fb7185' },
};

export const AccountsPane: React.FC<AccountsPaneProps> = ({
  accounts,
  selectedAccountId,
  onSelectAccount,
  onOpenStatement,
}) => {
  const { settings } = useSettings();
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (type: string) => {
    setCollapsedGroups(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const filteredAccounts = accounts.filter(acc =>
    acc.accountNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    acc.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    acc.currency.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const grouped = filteredAccounts.reduce((acc, account) => {
    if (!acc[account.type]) {
      acc[account.type] = [];
    }
    acc[account.type].push(account);
    return acc;
  }, {} as Record<AccountType, Account[]>);

  const order: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

  return (
    <aside style={{
      width: '290px',
      height: '100%',
      background: 'var(--bg-panel)',
      borderRight: '1px solid var(--border-grid)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* Pane Header */}
      <div style={{
        height: '34px',
        padding: '0 10px',
        borderBottom: '1px solid var(--border-grid)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-elevated)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className="font-mono" style={{ fontWeight: 700, fontSize: '11px', letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Chart of Accounts
          </span>
          <span className="badge badge-neutral" style={{ fontSize: '9px' }}>
            {accounts.length}
          </span>
        </div>

        {selectedAccountId && (
          <button
            onClick={() => onSelectAccount(null)}
            className="btn btn-secondary"
            style={{ padding: '1px 5px', fontSize: '9px', height: '20px' }}
            title="Clear account journal filter"
          >
            <X size={9} strokeWidth={1.5} /> Clear
          </button>
        )}
      </div>

      {/* Account Search */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-grid)', background: 'var(--bg-panel)', flexShrink: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          background: 'var(--bg-canvas)',
          border: '1px solid var(--border-grid)',
          borderRadius: '2px',
          padding: '3px 6px',
        }}>
          <Search size={11} strokeWidth={1.5} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Filter accounts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-main)',
              fontSize: '11px',
              width: '100%',
              fontFamily: 'var(--font-mono)',
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
            >
              <X size={11} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* Account Groups List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {order.map((cat) => {
          const catAccounts = grouped[cat] || [];
          if (catAccounts.length === 0) return null;

          const isCollapsed = collapsedGroups[cat] ?? false;
          const meta = CATEGORY_META[cat];
          const IconComp = meta.icon;

          // Category total
          let catTotalMinor = 0n;
          for (const a of catAccounts) {
            catTotalMinor += BigInt(a.availableBalanceMinor || 0);
          }

          return (
            <div key={cat} style={{ borderBottom: '1px solid var(--border-grid)' }}>
              {/* Category Header */}
              <div
                onClick={() => toggleGroup(cat)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '5px 8px',
                  background: 'var(--bg-elevated)',
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderBottom: isCollapsed ? 'none' : '1px solid var(--border-grid)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {isCollapsed ? (
                    <ChevronRight size={12} strokeWidth={1.5} style={{ color: 'var(--text-muted)' }} />
                  ) : (
                    <ChevronDown size={12} strokeWidth={1.5} style={{ color: 'var(--text-muted)' }} />
                  )}
                  <IconComp size={12} strokeWidth={1.5} style={{ color: meta.color }} />
                  <span className="font-mono" style={{ fontWeight: 600, fontSize: '10px', color: meta.color, letterSpacing: '0.04em' }}>
                    {meta.label.toUpperCase()}
                  </span>
                  <span className={`badge-dir badge-dir-${meta.normalDir.toLowerCase()}`}>
                    {meta.normalDir}
                  </span>
                </div>

                <span className="tabular-nums font-mono text-right" style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  color: catTotalMinor < 0n ? 'var(--acc-debit)' : 'var(--text-main)',
                }}>
                  {formatMinor(catTotalMinor, 'USD', settings.currencyFormat, settings.zeroStyle)}
                </span>
              </div>

              {/* Accounts under category */}
              {!isCollapsed && (
                <div>
                  {catAccounts.map((account) => {
                    const isSelected = selectedAccountId === account.id;

                    return (
                      <div
                        key={account.id}
                        onClick={() => onSelectAccount(isSelected ? null : account.id)}
                        style={{
                          background: isSelected ? 'var(--bg-selected)' : 'var(--bg-panel)',
                          borderLeft: isSelected ? '2px solid var(--border-accent)' : '2px solid transparent',
                          borderBottom: '1px solid var(--border-grid)',
                          padding: '6px 8px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '3px',
                          transition: 'background 0.1s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'var(--bg-panel)';
                        }}
                      >
                        {/* Row 1: Account Number & Currency / Badges */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                          <span className="font-mono" style={{
                            fontWeight: 600,
                            fontSize: '11px',
                            color: isSelected ? 'var(--border-accent)' : 'var(--text-main)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }} title={account.accountNumber}>
                            {account.accountNumber}
                          </span>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                            <span className="badge-currency">
                              {account.currency}
                            </span>
                            {account.allowNegativeBalance && (
                              <span style={{
                                fontSize: '8px',
                                background: 'rgba(56, 189, 248, 0.1)',
                                color: 'var(--border-accent)',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                padding: '1px 3px',
                                borderRadius: '2px',
                                fontFamily: 'var(--font-mono)'
                              }} title="Negative Balance Allowed (OD-OK)">
                                OD-OK
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Row 2: Available Balance & Actions */}
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span className="tabular-nums font-mono text-left" style={{
                              fontSize: '12px',
                              fontWeight: 700,
                              color: account.availableBalanceMinor < 0 ? 'var(--acc-debit)' : 'var(--acc-credit)',
                            }}>
                              {formatMinor(account.availableBalanceMinor, account.currency, settings.currencyFormat, settings.zeroStyle)}
                            </span>
                            {account.pendingBalanceMinor > 0 && (
                              <span className="tabular-nums font-mono" style={{ fontSize: '9px', color: 'var(--acc-hold)' }}>
                                Hold: {formatMinor(account.pendingBalanceMinor, account.currency, settings.currencyFormat, settings.zeroStyle)}
                              </span>
                            )}
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenStatement(account);
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '1px 5px', height: '18px', fontSize: '9px', gap: '3px' }}
                            title="Open Statement"
                          >
                            <FileText size={9} strokeWidth={1.5} />
                            <span>Stmt</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
