import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import type { AppLanguage } from '@/utils/api';

import en from './en';
import ro from './ro';

const STORAGE_KEY = 'app_language';

type Dictionary = typeof en;
type TranslationKey = keyof Dictionary;

const DICTIONARIES: Record<AppLanguage, Dictionary> = { EN: en, RO: ro };

interface I18nContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'EN',
  setLanguage: async () => {},
  t: (key) => key,
});

type Listener = (lang: AppLanguage) => void;
let listeners: Listener[] = [];

export async function applyLanguageFromServer(lang: AppLanguage | undefined | null): Promise<void> {
  if (lang !== 'RO' && lang !== 'EN') return;
  await writeStoredLanguage(lang);
  listeners.forEach((l) => l(lang));
}

async function readStoredLanguage(): Promise<AppLanguage | null> {
  try {
    if (Platform.OS === 'web') {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw === 'RO' || raw === 'EN' ? raw : null;
    }
    const SecureStore = await import('expo-secure-store');
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    return raw === 'RO' || raw === 'EN' ? raw : null;
  } catch {
    return null;
  }
}

async function writeStoredLanguage(lang: AppLanguage): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(STORAGE_KEY, lang);
      return;
    }
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(STORAGE_KEY, lang);
  } catch {
    // best-effort
  }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>('EN');

  useEffect(() => {
    void readStoredLanguage().then((stored) => {
      if (stored) setLanguageState(stored);
    });
    const listener: Listener = (lang) => setLanguageState(lang);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  const setLanguage = useCallback(async (lang: AppLanguage) => {
    setLanguageState(lang);
    await writeStoredLanguage(lang);
  }, []);

  const t = useCallback(
    (key: TranslationKey) => {
      const dict = DICTIONARIES[language];
      return dict[key] ?? en[key] ?? key;
    },
    [language]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export function useT(): I18nContextValue['t'] {
  return useI18n().t;
}
