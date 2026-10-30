import React, { useState } from 'react';
import {
  FolderTree,
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

interface AccountsPaneProps {
  accounts: Account[];
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string | null) => void;
  onOpenStatement: (account: Account) => void;
}

const CATEGORY_CONFIG: Record<AccountType, { label: string; icon: React.FC<{ size?: number }>; color: string }> = {
  ASSET: { label: 'Assets', icon: Landmark, color: '#38bdf8' },
  LIABILITY: { label: 'Liabilities', icon: Wallet, color: '#f59e0b' },
  EQUITY: { label: 'Equity', icon: Building, color: '#a855f7' },
  REVENUE: { label: 'Revenue', icon: TrendingUp, color: '#10b981' },
  EXPENSE: { label: 'Expenses', icon: CreditCard, color: '#f43f5e' },
};

export const AccountsPane: React.FC<AccountsPaneProps> = ({
  accounts,
  selectedAccountId,
  onSelectAccount,
  onOpenStatement,
}) => {
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
      width: '340px',
      height: '100%',
      background: 'var(--bg-primary)',
      borderRight: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* Pane Header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FolderTree size={15} style={{ color: '#38bdf8' }} />
          <span style={{ fontWeight: 700, fontSize: '12px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Chart of Accounts
          </span>
          <span className="badge badge-neutral" style={{ fontSize: '10px' }}>
            {accounts.length}
          </span>
        </div>

        {selectedAccountId && (
          <button
            onClick={() => onSelectAccount(null)}
            className="btn btn-secondary"
            style={{ padding: '2px 6px', fontSize: '10px', height: '22px' }}
            title="Clear account filter"
          >
            <X size={10} /> Clear Filter
          </button>
        )}
      </div>

      {/* Search Input */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'var(--bg-app)',
          border: '1px solid var(--border-strong)',
          borderRadius: '4px',
          padding: '4px 8px',
        }}>
          <Search size={12} style={{ color: 'var(--text-dim)' }} />
          <input
            type="text"
            placeholder="Search accounts or currency..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-main)',
              fontSize: '11px',
              width: '100%',
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Account Tree & Balances */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        {order.map((cat) => {
          const catAccounts = grouped[cat] || [];
          if (catAccounts.length === 0) return null;

          const isCollapsed = collapsedGroups[cat] ?? false;
          const config = CATEGORY_CONFIG[cat];
          const IconComponent = config.icon;

          // Compute category subtotal
          let catTotalMinor = 0n;
          for (const a of catAccounts) {
            catTotalMinor += BigInt(a.availableBalanceMinor || 0);
          }

          return (
            <div key={cat} style={{ marginBottom: '8px' }}>
              {/* Group Header */}
              <div
                onClick={() => toggleGroup(cat)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {isCollapsed ? <ChevronRight size={13} style={{ color: 'var(--text-dim)' }} /> : <ChevronDown size={13} style={{ color: 'var(--text-dim)' }} />}
                  <IconComponent size={13} />
                  <span style={{ fontWeight: 600, fontSize: '11px', color: config.color }}>
                    {config.label.toUpperCase()}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    ({catAccounts.length})
                  </span>
                </div>

                <span className="tabular-nums font-mono text-right" style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: catTotalMinor < 0n ? '#fb7185' : 'var(--text-main)',
                }}>
                  {formatMinor(catTotalMinor)}
                </span>
              </div>

              {/* Account Cards */}
              {!isCollapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', paddingLeft: '6px' }}>
                  {catAccounts.map((account) => {
                    const isSelected = selectedAccountId === account.id;

                    return (
                      <div
                        key={account.id}
                        onClick={() => onSelectAccount(isSelected ? null : account.id)}
                        style={{
                          background: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-panel)',
                          border: `1px solid ${isSelected ? '#38bdf8' : 'var(--border-subtle)'}`,
                          borderRadius: '4px',
                          padding: '8px 10px',
                          cursor: 'pointer',
                          transition: 'all 0.1s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        {/* Account Name & Currency */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                            <span className="font-mono" style={{
                              fontWeight: 600,
                              fontSize: '11px',
                              color: isSelected ? '#38bdf8' : 'var(--text-main)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }} title={account.accountNumber}>
                              {account.accountNumber}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span className="badge-currency font-mono">
                              {account.currency}
                            </span>
                            {account.allowNegativeBalance && (
                              <span style={{
                                fontSize: '9px',
                                background: 'rgba(56, 189, 248, 0.1)',
                                color: '#38bdf8',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                padding: '1px 3px',
                                borderRadius: '2px',
                                fontFamily: 'var(--font-mono)'
                              }} title="Negative Balance Allowed (e.g. Treasury Central Liquidity)">
                                OD-OK
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Financial Figures Table */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, 1fr)',
                          gap: '4px',
                          background: 'var(--bg-app)',
                          padding: '4px 6px',
                          borderRadius: '3px',
                          border: '1px solid var(--border-subtle)',
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '9px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                              Posted
                            </span>
                            <span className="tabular-nums font-mono text-left" style={{
                              fontSize: '11px',
                              color: account.postedBalanceMinor < 0 ? '#fb7185' : '#cbd5e1',
                              fontWeight: 500,
                            }}>
                              {formatMinor(account.postedBalanceMinor, account.currency)}
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '9px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                              Holds
                            </span>
                            <span className="tabular-nums font-mono text-left" style={{
                              fontSize: '11px',
                              color: account.pendingBalanceMinor > 0 ? '#fbbf24' : 'var(--text-dim)',
                            }}>
                              {formatMinor(account.pendingBalanceMinor, account.currency)}
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '9px', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                              Available
                            </span>
                            <span className="tabular-nums font-mono text-left" style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: account.availableBalanceMinor < 0 ? '#fb7185' : '#34d399',
                            }}>
                              {formatMinor(account.availableBalanceMinor, account.currency)}
                            </span>
                          </div>
                        </div>

                        {/* Statement link button */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '2px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                            v{account.version} • {account.type}
                          </span>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenStatement(account);
                            }}
                            className="btn btn-secondary"
                            style={{ padding: '2px 6px', height: '20px', fontSize: '10px', gap: '3px' }}
                            title="Open running balance ledger statement"
                          >
                            <FileText size={10} /> Statement
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
