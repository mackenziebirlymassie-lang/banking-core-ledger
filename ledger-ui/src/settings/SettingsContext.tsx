import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  type LedgerSettings,
  type SettingsContextValue,
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
} from './types';

const SettingsContext = createContext<SettingsContextValue | null>(null);

function loadValidatedSettings(): LedgerSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS;

    return {
      timeDisplay: ['UTC', 'LOCAL', 'EPOCH_MS'].includes(parsed.timeDisplay)
        ? parsed.timeDisplay
        : DEFAULT_SETTINGS.timeDisplay,
      currencyFormat: ['SYMBOL', 'ISO_CODE', 'MINOR_UNITS'].includes(parsed.currencyFormat)
        ? parsed.currencyFormat
        : DEFAULT_SETTINGS.currencyFormat,
      densityMode: ['COMPACT', 'STANDARD'].includes(parsed.densityMode)
        ? parsed.densityMode
        : DEFAULT_SETTINGS.densityMode,
      zeroStyle: ['MUTED', 'SLASHED'].includes(parsed.zeroStyle)
        ? parsed.zeroStyle
        : DEFAULT_SETTINGS.zeroStyle,
      audioFeedback: typeof parsed.audioFeedback === 'boolean'
        ? parsed.audioFeedback
        : DEFAULT_SETTINGS.audioFeedback,
      defaultBurstCount: [100, 500, 1000, 2500].includes(parsed.defaultBurstCount)
        ? parsed.defaultBurstCount
        : DEFAULT_SETTINGS.defaultBurstCount,
      burstThrottleMs: typeof parsed.burstThrottleMs === 'number' && parsed.burstThrottleMs >= 0
        ? parsed.burstThrottleMs
        : DEFAULT_SETTINGS.burstThrottleMs,
      autoAuditInterval: [0, 15, 30, 60].includes(parsed.autoAuditInterval)
        ? parsed.autoAuditInterval
        : DEFAULT_SETTINGS.autoAuditInterval,
      apiBaseUrl: typeof parsed.apiBaseUrl === 'string' && parsed.apiBaseUrl.trim()
        ? parsed.apiBaseUrl.trim()
        : DEFAULT_SETTINGS.apiBaseUrl,
      transportMode: ['AUTO', 'FORCE_JAVA_BACKEND', 'FORCE_LOCAL_KERNEL'].includes(parsed.transportMode)
        ? parsed.transportMode
        : DEFAULT_SETTINGS.transportMode,
    };
  } catch (e) {
    console.warn('Failed to load settings from localStorage, falling back to defaults', e);
    return DEFAULT_SETTINGS;
  }
}

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<LedgerSettings>(loadValidatedSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to persist settings', e);
    }
  }, [settings]);

  const updateSettings = useCallback((partial: Partial<LedgerSettings>) => {
    setSettings(prev => ({ ...prev, ...partial }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear settings', e);
    }
  }, []);

  const openSettings = useCallback((_tab?: number) => {
    setIsSettingsOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSettings,
        resetSettings,
        isSettingsOpen,
        openSettings,
        closeSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}
