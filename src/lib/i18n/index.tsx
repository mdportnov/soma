import * as React from "react";
import { en } from "./en";
import { ru } from "./ru";

const I18N_KEY = "soma.lang";

export type Lang = "en" | "ru";

const dictionaries = { en, ru } as const;

export function loadLang(): Lang {
  const stored = localStorage.getItem(I18N_KEY);
  if (stored === "en" || stored === "ru") return stored;
  return navigator.language.startsWith("ru") ? "ru" : "en";
}

export function saveLang(lang: Lang): void {
  localStorage.setItem(I18N_KEY, lang);
}

// Translation function with fallback chain: current lang → en → key
function createTranslator(lang: Lang) {
  return function t(key: string, vars?: Record<string, string>): string {
    const keys = key.split(".");

    // Try current language first
    let value = keys.reduce((obj: any, k) => obj?.[k], dictionaries[lang]);

    // Fallback to English if not found
    if (value === undefined && lang !== "en") {
      value = keys.reduce((obj: any, k) => obj?.[k], dictionaries.en);
    }

    // Final fallback to key itself
    if (value === undefined) {
      value = key;
    }

    // Interpolate variables if provided
    if (typeof value === "string" && vars) {
      return value.replace(/\{\{(\w+)\}\}/g, (_, varName) => vars[varName] || "{{" + varName + "}}");
    }

    return String(value);
  };
}

type I18nContextType = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: ReturnType<typeof createTranslator>;
};

const I18nContext = React.createContext<I18nContextType | null>(null);

export function useI18n(): I18nContextType {
  const ctx = React.useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>(() => loadLang());

  const setLang = React.useCallback((newLang: Lang) => {
    setLangState(newLang);
    saveLang(newLang);
  }, []);

  const t = React.useMemo(() => createTranslator(lang), [lang]);

  // Set document language attribute
  React.useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = React.useMemo(() => ({
    lang,
    setLang,
    t,
  }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}