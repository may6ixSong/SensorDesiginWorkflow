import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Lang = 'en' | 'ko';

const STORAGE_KEY = 'siren-lang';

interface LanguageCtx {
  lang: Lang;
  toggle: () => void;
}

const Ctx = createContext<LanguageCtx | null>(null);

/**
 * Holds the selected UI language and persists it. The app's copy is currently
 * English-only, so switching this changes `<html lang>` and the stored
 * preference but not yet the rendered strings — the translation catalogue is a
 * follow-up, and this is the single place it will hook into.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === 'undefined') return 'en';
    return window.localStorage.getItem(STORAGE_KEY) === 'ko' ? 'ko' : 'en';
  });

  useEffect(() => {
    document.documentElement.lang = lang;
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const toggle = useCallback(() => setLang((l) => (l === 'en' ? 'ko' : 'en')), []);
  const value = useMemo(() => ({ lang, toggle }), [lang, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLanguage() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
