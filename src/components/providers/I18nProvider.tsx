"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Dictionary, getDictionary, Locale, DEFAULT_LOCALE } from "@/lib/i18n";
import { setLocaleCookie } from "@/actions/i18n";

interface I18nContextType {
  locale: Locale;
  dictionary: Dictionary;
  setLocale: (newLocale: Locale) => Promise<void>;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

interface I18nProviderProps {
  children: ReactNode;
  initialLocale: Locale;
}

export function I18nProvider({ children, initialLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [dictionary, setDictionary] = useState<Dictionary>(getDictionary(initialLocale));

  const setLocale = async (newLocale: Locale) => {
    setLocaleState(newLocale);
    setDictionary(getDictionary(newLocale));
    await setLocaleCookie(newLocale);
  };

  return (
    <I18nContext.Provider value={{ locale, dictionary, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}
