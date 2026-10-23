import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  ORDER_STATUS_KEYS,
  resolveLocale,
  translate,
  type Locale,
  type MessageKey,
  type TranslateParams,
} from "./locales";

type I18nValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, params?: TranslateParams) => string;
  orderStatus: (status: string) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // Server render and first client render use the default; the saved choice is applied after hydration.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved) setLocaleState(resolveLocale(saved));
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const t = (key: MessageKey, params?: TranslateParams) => translate(locale, key, params);
    return {
      locale,
      setLocale,
      t,
      orderStatus: (status) => {
        const key = ORDER_STATUS_KEYS[status];
        return key ? t(key) : status;
      },
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
