import React, { useState, useRef } from 'react';
import {
  X,
  Sliders,
  Cpu,
  Database,
  Globe,
  Check,
  Volume2,
  VolumeX,
  Download,
  Upload,
  AlertTriangle,
  RotateCcw,
  Activity,
} from 'lucide-react';
import { useSettings } from '../../settings/SettingsContext';
import {
  type TimeDisplay,
  type CurrencyFormat,
  type DensityMode,
  type ZeroStyle,
  type BurstCount,
  type TransportPreference,
} from '../../settings/types';
import { playTick, playCommit, playAlert } from '../../utils/terminalAudio';
import { ledgerClient, type EngineMode } from '../../api/LedgerClient';
import type { StreamConnectionStatus } from '../../services/api';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  engineMode: EngineMode;
  connectionStatus: StreamConnectionStatus;
  totalTransactions: number;
  onRefreshData: () => Promise<void>;
  onTriggerToast: (toast: { title: string; detail: string; type: 'success' | 'burst' | 'error' }) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  engineMode,
  connectionStatus,
  totalTransactions,
  onRefreshData,
  onTriggerToast,
}) => {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<number>(0);

  // Ping gateway state
  const [isPinging, setIsPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; latencyMs: number; statusText: string } | null>(null);

  // Factory reset guardrail state
  const [purgeInput, setPurgeInput] = useState('');
  const [isPurging, setIsPurging] = useState(false);

  // Snapshot import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  if (!isOpen) return null;

  const handleTestAudio = (type: 'tick' | 'commit' | 'alert') => {
    if (type === 'tick') playTick(true);
    if (type === 'commit') playCommit(true);
    if (type === 'alert') playAlert(true);
  };

  const handlePingGateway = async () => {
    setIsPinging(true);
    try {
      const res = await ledgerClient.pingGateway(settings.apiBaseUrl);
      setPingResult(res);
      if (res.ok) {
        playCommit(settings.audioFeedback);
      } else {
        playAlert(settings.audioFeedback);
      }
    } finally {
      setIsPinging(false);
    }
  };

  const handleExportSnapshot = async () => {
    try {
      const jsonStr = await ledgerClient.exportSnapshot();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ledger-snapshot-${now}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      playCommit(settings.audioFeedback);
      onTriggerToast({
        title: 'Cryptographic Snapshot Exported',
        detail: `Exported ${totalTransactions} blocks with Merkle verification to JSON file.`,
        type: 'success',
      });
    } catch (err: any) {
      playAlert(settings.audioFeedback);
      onTriggerToast({
        title: 'Snapshot Export Failed',
        detail: err.message || 'Error serializing ledger state',
        type: 'error',
      });
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const res = await ledgerClient.importSnapshot(text);
      if (res.success) {
        await onRefreshData();
        playCommit(settings.audioFeedback);
        onTriggerToast({
          title: 'Snapshot Restored Successfully',
          detail: `Loaded ${res.count} verified transactions into local ledger state.`,
          type: 'success',
        });
      } else {
        playAlert(settings.audioFeedback);
        onTriggerToast({
          title: 'Snapshot Restoration Failed',
          detail: res.error || 'Cryptographic integrity check failed on imported file',
          type: 'error',
        });
      }
    } catch (err: any) {
      playAlert(settings.audioFeedback);
      onTriggerToast({
        title: 'Failed to Read Snapshot File',
        detail: err.message || 'Invalid JSON file',
        type: 'error',
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExecutePurge = async () => {
    if (purgeInput !== 'PURGE-LEDGER') return;
    setIsPurging(true);
    try {
      ledgerClient.resetStandaloneState();
      await onRefreshData();
      setPurgeInput('');
      playCommit(settings.audioFeedback);
      onTriggerToast({
        title: 'Ledger State Purged',
        detail: 'Reset all accounts and transaction history back to institutional seed state.',
        type: 'success',
      });
    } catch (err: any) {
      playAlert(settings.audioFeedback);
      onTriggerToast({
        title: 'Purge Failed',
        detail: err.message || 'Failed to purge ledger state',
        type: 'error',
      });
    } finally {
      setIsPurging(false);
    }
  };

  const tabs = [
    { id: 0, label: '01 DISPLAY & CONVENTIONS', icon: Sliders },
    { id: 1, label: '02 ENGINE & SIMULATOR', icon: Cpu },
    { id: 2, label: '03 STORAGE & SNAPSHOTS', icon: Database },
    { id: 3, label: '04 GATEWAY & CONNECTIVITY', icon: Globe },
  ];

  const isJava = engineMode === 'JAVA_21_BACKEND';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 7, 11, 0.85)',
        backdropFilter: 'blur(3px)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '880px',
          height: '600px',
          background: '#0c0f17',
          border: '1px solid var(--border-grid)',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '2px',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Top Title Bar */}
        <div
          style={{
            height: '48px',
            background: 'var(--bg-panel)',
            borderBottom: '1px solid var(--border-grid)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            flexShrink: 0,
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={13} strokeWidth={1.5} style={{ color: 'var(--border-accent)' }} />
            <span
              className="font-mono"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: '#f8fafc',
              }}
            >
              SYSTEM CONFIGURATION & OPERATOR PREFERENCES
            </span>
            <span
              className="font-mono"
              style={{
                fontSize: '9px',
                color: 'var(--text-muted)',
                background: 'var(--bg-canvas)',
                padding: '1px 5px',
                border: '1px solid var(--border-grid)',
                borderRadius: '2px',
              }}
            >
              v2.1
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              <kbd>Esc</kbd> to exit
            </span>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '3px',
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Modal Body: Left Tabstrip (220px) + Right Content Panel */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left Vertical Navigation */}
          <div
            style={{
              width: '240px',
              borderRight: '1px solid var(--border-grid)',
              background: '#080a11',
              display: 'flex',
              flexDirection: 'column',
              padding: '8px 0',
              flexShrink: 0,
            }}
          >
            {tabs.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    playTick(settings.audioFeedback);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    background: active ? '#111726' : 'transparent',
                    color: active ? '#f8fafc' : 'var(--text-muted)',
                    border: 'none',
                    borderLeft: active ? '2px solid var(--border-accent)' : '2px solid transparent',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: active ? 600 : 400,
                    fontFamily: 'var(--font-mono)',
                    textAlign: 'left',
                    transition: 'all 0.1s ease',
                  }}
                >
                  <Icon size={12} strokeWidth={1.5} style={{ color: active ? 'var(--border-accent)' : 'inherit' }} />
                  <span>{tab.label}</span>
                </button>
              );
            })}

            <div style={{ marginTop: 'auto', padding: '12px 14px', borderTop: '1px solid var(--border-grid)' }}>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                LOCAL PERSISTENCE:
              </div>
              <div style={{ fontSize: '10px', color: 'var(--acc-credit)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                CORE_LEDGER_CONFIG_V1
              </div>
            </div>
          </div>

          {/* Right Tab Content View */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '32px',
              background: '#0c0f17',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            {/* TAB 0: DISPLAY & CONVENTIONS */}
            {activeTab === 0 && (
              <>
                <section>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
                    TIMESTAMP STANDARD
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Controls date and time notation across the journal feed and audit inspector.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                    {(['UTC', 'LOCAL', 'EPOCH_MS'] as TimeDisplay[]).map(mode => (
                      <button
                        key={mode}
                        onClick={() => updateSettings({ timeDisplay: mode })}
                        className={`btn ${settings.timeDisplay === mode ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ height: '32px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}
                      >
                        {mode === 'UTC' ? 'UTC (ZULU)' : mode === 'LOCAL' ? 'LOCAL TIMEZONE' : 'UNIX MS'}
                      </button>
                    ))}
                  </div>
                </section>

                <section style={{ borderTop: '1px solid var(--border-grid)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
                    FINANCIAL NOTATION
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Select how debit and credit values are presented across all views.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                    {(['SYMBOL', 'ISO_CODE', 'MINOR_UNITS'] as CurrencyFormat[]).map(fmt => (
                      <button
                        key={fmt}
                        onClick={() => updateSettings({ currencyFormat: fmt })}
                        className={`btn ${settings.currencyFormat === fmt ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ height: '32px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}
                      >
                        {fmt === 'SYMBOL' ? 'SYMBOL: $1,250.00' : fmt === 'ISO_CODE' ? 'ISO: USD 1,250.00' : 'RAW: 125000 ¢'}
                      </button>
                    ))}
                  </div>
                </section>

                <section style={{ borderTop: '1px solid var(--border-grid)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
                    TERMINAL DENSITY & ZERO NOTATION
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Adjust row height for high-frequency viewport scanning.
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {(['STANDARD', 'COMPACT'] as DensityMode[]).map(density => (
                      <button
                        key={density}
                        onClick={() => updateSettings({ densityMode: density })}
                        className={`btn ${settings.densityMode === density ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ flex: 1, height: '32px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}
                      >
                        {density === 'COMPACT' ? 'COMPACT (36px)' : 'STANDARD (44px)'}
                      </button>
                    ))}
                    {(['MUTED', 'SLASHED'] as ZeroStyle[]).map(z => (
                      <button
                        key={z}
                        onClick={() => updateSettings({ zeroStyle: z })}
                        className={`btn ${settings.zeroStyle === z ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ flex: 1, height: '32px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}
                      >
                        {z === 'SLASHED' ? 'SLASHED ZERO (Ø)' : 'MUTED ZERO (0.00)'}
                      </button>
                    ))}
                  </div>
                </section>

                <section style={{ borderTop: '1px solid var(--border-grid)', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc' }}>
                        SYNTHETIC ACOUSTIC FEEDBACK
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        Native Web Audio synthetic oscillator feedback for key navigation and transfer commits.
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const next = !settings.audioFeedback;
                        updateSettings({ audioFeedback: next });
                        if (next) playCommit(true);
                      }}
                      className={`btn ${settings.audioFeedback ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ height: '26px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}
                    >
                      {settings.audioFeedback ? <Volume2 size={12} /> : <VolumeX size={12} />}
                      <span>{settings.audioFeedback ? 'ENABLED' : 'MUTED'}</span>
                    </button>
                  </div>

                  {settings.audioFeedback && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                      <button onClick={() => handleTestAudio('tick')} className="btn btn-secondary" style={{ height: '24px', fontSize: '9px' }}>
                        Test Tick (800Hz)
                      </button>
                      <button onClick={() => handleTestAudio('commit')} className="btn btn-secondary" style={{ height: '24px', fontSize: '9px' }}>
                        Test Commit (600-1200Hz)
                      </button>
                      <button onClick={() => handleTestAudio('alert')} className="btn btn-secondary" style={{ height: '24px', fontSize: '9px' }}>
                        Test Alert (180Hz)
                      </button>
                    </div>
                  )}
                </section>
              </>
            )}

            {/* TAB 1: ENGINE & SIMULATOR */}
            {activeTab === 1 && (
              <>
                <section>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
                    STRESS BURST VOLUME
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Configures transaction batch size generated when pressing the [B] burst hotkey.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {([100, 500, 1000, 2500] as BurstCount[]).map(cnt => (
                      <button
                        key={cnt}
                        onClick={() => updateSettings({ defaultBurstCount: cnt })}
                        className={`btn ${settings.defaultBurstCount === cnt ? 'btn-burst' : 'btn-secondary'}`}
                        style={{ height: '32px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}
                      >
                        {cnt} TXs
                      </button>
                    ))}
                  </div>
                </section>

                <section style={{ borderTop: '1px solid var(--border-grid)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
                    INTER-TRANSACTION THROTTLE
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Adds deliberate microsecond delays between simulated legs for visual streaming demonstration.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {[
                      { val: 0, label: '0ms (Line-Rate)' },
                      { val: 5, label: '5ms (Fast)' },
                      { val: 10, label: '10ms (Stream)' },
                      { val: 20, label: '20ms (Visual)' },
                    ].map(t => (
                      <button
                        key={t.val}
                        onClick={() => updateSettings({ burstThrottleMs: t.val })}
                        className={`btn ${settings.burstThrottleMs === t.val ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ height: '32px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </section>

                <section style={{ borderTop: '1px solid var(--border-grid)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
                    AUTOMATED MERKLE AUDIT HEARTBEAT
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Background timer to recalculate the complete SHA-256 chain and Merkle root.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {[
                      { val: 0, label: 'OFF (Manual)' },
                      { val: 15, label: 'Every 15s' },
                      { val: 30, label: 'Every 30s' },
                      { val: 60, label: 'Every 60s' },
                    ].map(h => (
                      <button
                        key={h.val}
                        onClick={() => updateSettings({ autoAuditInterval: h.val })}
                        className={`btn ${settings.autoAuditInterval === h.val ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ height: '32px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                </section>

                <div
                  style={{
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-grid)',
                    borderRadius: '2px',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>PROJECTED SIMULATION THROUGHPUT:</span>
                  <span style={{ color: 'var(--acc-credit)', fontWeight: 600 }}>
                    {settings.burstThrottleMs === 0 ? '~12,000+ TX/SEC' : `~${Math.round(1000 / settings.burstThrottleMs)} TX/SEC`}
                  </span>
                </div>
              </>
            )}

            {/* TAB 2: STORAGE & SNAPSHOTS */}
            {activeTab === 2 && (
              <>
                <section>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
                    ACTIVE STORAGE TELEMETRY
                  </div>
                  <div
                    style={{
                      background: 'var(--bg-canvas)',
                      border: '1px solid var(--border-grid)',
                      borderRadius: '2px',
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>PRIMARY ENGINE:</span>
                      <span style={{ color: isJava ? 'var(--border-accent)' : '#a78bfa', fontWeight: 600 }}>
                        {isJava ? 'Java 21 Spring Boot + PostgreSQL/H2 WAL' : 'Embedded Web Crypto Standalone Kernel'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>ON-DISK TARGET:</span>
                      <span style={{ color: 'var(--text-main)' }}>
                        {isJava ? './data/core_ledger.mv.db + ./data/ledger.wal' : 'Browser IndexedDB / LocalStorage'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>COMMITTED JOURNAL:</span>
                      <span style={{ color: 'var(--text-main)' }}>{totalTransactions} SEQUENCED BLOCKS</span>
                    </div>
                  </div>
                </section>

                <section style={{ borderTop: '1px solid var(--border-grid)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
                    CRYPTOGRAPHIC SNAPSHOT ARCHIVES
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Export a full ledger state dump including accounts, transactions, and Merkle root, or restore from an archive.
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleExportSnapshot}
                      className="btn btn-secondary"
                      style={{ flex: 1, height: '30px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}
                    >
                      <Download size={12} strokeWidth={1.5} />
                      <span>EXPORT SNAPSHOT (JSON)</span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isImporting}
                      className="btn btn-secondary"
                      style={{ flex: 1, height: '30px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}
                    >
                      <Upload size={12} strokeWidth={1.5} />
                      <span>{isImporting ? 'VALIDATING...' : 'RESTORE SNAPSHOT (JSON)'}</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      style={{ display: 'none' }}
                      onChange={handleFileSelected}
                    />
                  </div>
                </section>

                {/* HAZARD ZONE */}
                <section
                  style={{
                    border: '1px solid #7f1d1d',
                    background: '#1a0d0e',
                    padding: '12px',
                    borderRadius: '2px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f87171', fontWeight: 600, fontSize: '11px' }}>
                    <AlertTriangle size={13} strokeWidth={2} />
                    <span>HAZARD ZONE: FACTORY STATE PURGE</span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#fca5a5', marginTop: '4px', marginBottom: '10px' }}>
                    Wipes all historical transactions and resets account balances back to the initial 25-block seed state.
                    Type <code style={{ color: '#fff', background: '#450a0a', padding: '1px 4px' }}>PURGE-LEDGER</code> below to unlock:
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={purgeInput}
                      onChange={e => setPurgeInput(e.target.value)}
                      placeholder="Type PURGE-LEDGER to confirm..."
                      style={{
                        flex: 1,
                        height: '28px',
                        background: '#07090e',
                        border: '1px solid #7f1d1d',
                        borderRadius: '2px',
                        color: '#f8fafc',
                        padding: '0 8px',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                      }}
                    />
                    <button
                      onClick={handleExecutePurge}
                      disabled={purgeInput !== 'PURGE-LEDGER' || isPurging}
                      style={{
                        height: '28px',
                        padding: '0 12px',
                        background: purgeInput === 'PURGE-LEDGER' ? '#dc2626' : '#450a0a',
                        color: purgeInput === 'PURGE-LEDGER' ? '#ffffff' : '#991b1b',
                        border: '1px solid #7f1d1d',
                        borderRadius: '2px',
                        cursor: purgeInput === 'PURGE-LEDGER' ? 'pointer' : 'not-allowed',
                        fontSize: '10px',
                        fontWeight: 600,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {isPurging ? 'PURGING...' : 'EXECUTE PURGE'}
                    </button>
                  </div>
                </section>
              </>
            )}

            {/* TAB 3: GATEWAY & CONNECTIVITY */}
            {activeTab === 3 && (
              <>
                <section>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
                    CORE BANKING API GATEWAY
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Active base URL for REST endpoints and Server-Sent Events stream (/api/v1).
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={settings.apiBaseUrl}
                      onChange={e => updateSettings({ apiBaseUrl: e.target.value })}
                      placeholder="http://localhost:8080"
                      style={{
                        flex: 1,
                        height: '28px',
                        background: 'var(--bg-canvas)',
                        border: '1px solid var(--border-grid)',
                        borderRadius: '2px',
                        color: '#f8fafc',
                        padding: '0 8px',
                        fontSize: '11px',
                        fontFamily: 'var(--font-mono)',
                      }}
                    />
                    <button
                      onClick={handlePingGateway}
                      disabled={isPinging}
                      className="btn btn-secondary"
                      style={{ height: '32px', fontSize: '11px', fontFamily: 'var(--font-mono)' }}
                    >
                      <Activity size={12} strokeWidth={1.5} />
                      <span>{isPinging ? 'PINGING...' : 'TEST LATENCY'}</span>
                    </button>
                  </div>

                  {pingResult && (
                    <div
                      style={{
                        marginTop: '6px',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono)',
                        color: pingResult.ok ? 'var(--acc-credit)' : 'var(--acc-debit)',
                      }}
                    >
                      {pingResult.ok ? `200 OK — Round-Trip Latency: ${pingResult.latencyMs}ms` : `FAILED: ${pingResult.statusText} (${pingResult.latencyMs}ms)`}
                    </div>
                  )}
                </section>

                <section style={{ borderTop: '1px solid var(--border-grid)', paddingTop: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
                    ROUTING & TRANSPORT OVERRIDE
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Force traffic through the local Spring Boot daemon or bypass to the in-memory cryptographic kernel.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {[
                      { id: 'AUTO', title: 'AUTOMATIC DETECTION', desc: 'Probe port 8080 on launch; fall back to embedded kernel if unreachable' },
                      { id: 'FORCE_JAVA_BACKEND', title: 'FORCE JAVA 21 + WAL BACKEND', desc: 'Direct all requests to Spring Boot REST API and PostgreSQL/H2 store' },
                      { id: 'FORCE_LOCAL_KERNEL', title: 'FORCE STANDALONE EMBEDDED KERNEL', desc: 'Execute pure in-browser BigInt double-entry accounting with Web Crypto' },
                    ].map(opt => (
                      <div
                        key={opt.id}
                        onClick={() => {
                          updateSettings({ transportMode: opt.id as TransportPreference });
                          if (opt.id === 'FORCE_JAVA_BACKEND') ledgerClient.setMode('JAVA_21_BACKEND');
                          if (opt.id === 'FORCE_LOCAL_KERNEL') ledgerClient.setMode('EMBEDDED_KERNEL');
                          if (opt.id === 'AUTO') ledgerClient.autoDetectMode();
                        }}
                        style={{
                          padding: '8px 12px',
                          background: settings.transportMode === opt.id ? '#131c2e' : 'var(--bg-canvas)',
                          border: `1px solid ${settings.transportMode === opt.id ? 'var(--border-accent)' : 'var(--border-grid)'}`,
                          borderRadius: '2px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 600, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                            {opt.title}
                          </div>
                          <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                            {opt.desc}
                          </div>
                        </div>
                        {settings.transportMode === opt.id && (
                          <Check size={14} style={{ color: 'var(--border-accent)' }} />
                        )}
                      </div>
                    ))}
                  </div>
                </section>

                <div
                  style={{
                    background: 'var(--bg-canvas)',
                    border: '1px solid var(--border-grid)',
                    borderRadius: '2px',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '10px',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>CURRENT ENGINE RUNTIME:</span>
                  <span style={{ color: isJava ? 'var(--border-accent)' : '#a78bfa', fontWeight: 600 }}>
                    {engineMode} ({connectionStatus})
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Modal Bottom Footer Actions */}
        <div
          style={{
            height: '42px',
            background: 'var(--bg-panel)',
            borderTop: '1px solid var(--border-grid)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 14px',
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => {
              resetSettings();
              playTick(true);
              onTriggerToast({
                title: 'Preferences Reset',
                detail: 'Restored factory default configuration settings.',
                type: 'success',
              });
            }}
            className="btn btn-secondary"
            style={{ height: '26px', fontSize: '10px', fontFamily: 'var(--font-mono)' }}
          >
            <RotateCcw size={11} strokeWidth={1.5} />
            <span>RESET DEFAULTS</span>
          </button>

          <button
            onClick={onClose}
            className="btn btn-primary"
            style={{ height: '26px', fontSize: '10px', fontFamily: 'var(--font-mono)', minWidth: '80px' }}
          >
            <span>APPLY & CLOSE</span>
          </button>
        </div>
      </div>
    </div>
  );
};
