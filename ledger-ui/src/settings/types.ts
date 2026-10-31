export type TimeDisplay = 'UTC' | 'LOCAL' | 'EPOCH_MS';
export type CurrencyFormat = 'SYMBOL' | 'ISO_CODE' | 'MINOR_UNITS';
export type DensityMode = 'COMPACT' | 'STANDARD';
export type ZeroStyle = 'MUTED' | 'SLASHED';
export type BurstCount = 100 | 500 | 1000 | 2500;
export type TransportPreference = 'AUTO' | 'FORCE_JAVA_BACKEND' | 'FORCE_LOCAL_KERNEL';

export interface LedgerSettings {
  // Display Conventions
  timeDisplay: TimeDisplay;
  currencyFormat: CurrencyFormat;
  densityMode: DensityMode;
  zeroStyle: ZeroStyle;
  audioFeedback: boolean;

  // Engine & Simulator Controls
  defaultBurstCount: BurstCount;
  burstThrottleMs: number; // 0, 5, 10, 20
  autoAuditInterval: number; // 0 (off), 15, 30, 60 seconds

  // Network & Gateway
  apiBaseUrl: string;
  transportMode: TransportPreference;
}

export interface SettingsContextValue {
  settings: LedgerSettings;
  updateSettings: (partial: Partial<LedgerSettings>) => void;
  resetSettings: () => void;
  isSettingsOpen: boolean;
  openSettings: (tab?: number) => void;
  closeSettings: () => void;
}

export const SETTINGS_STORAGE_KEY = 'CORE_LEDGER_CONFIG_V1';

export const DEFAULT_SETTINGS: LedgerSettings = {
  timeDisplay: 'UTC',
  currencyFormat: 'SYMBOL',
  densityMode: 'STANDARD',
  zeroStyle: 'MUTED',
  audioFeedback: false,
  defaultBurstCount: 500,
  burstThrottleMs: 0,
  autoAuditInterval: 0,
  apiBaseUrl: 'http://localhost:8080',
  transportMode: 'AUTO',
};
