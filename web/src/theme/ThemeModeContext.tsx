import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeMode } from './themeVars';

const STORAGE_KEY = 'siren-theme-mode';

interface ThemeModeCtx {
  mode: ThemeMode;
  toggle: () => void;
}

const Ctx = createContext<ThemeModeCtx | null>(null);

/**
 * The actual light/dark CSS custom properties live as static rules in
 * index.html (`:root` / `html[data-theme="dark"]`), applied by a
 * render-blocking inline script before first paint (no flash). Here we only
 * need to flip the attribute and persist the choice.
 */
function readInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === 'dark' ? 'dark' : 'light';
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readInitialMode);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggle = useCallback(() => setMode((m) => (m === 'light' ? 'dark' : 'light')), []);

  const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useThemeMode() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useThemeMode must be used within ThemeModeProvider');
  return ctx;
}
