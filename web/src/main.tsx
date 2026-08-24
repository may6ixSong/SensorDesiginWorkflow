import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { buildTheme } from './theme/theme';
import { ThemeModeProvider, useThemeMode } from './theme/ThemeModeContext';
import { AuthProvider } from './app/providers/AuthProvider';
import { PlatformPreferencesSync } from './components/layout/PlatformPreferencesSync';
import { resolveOnlineStatus } from './utils/helper';
import App from './App';
import './i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
    },
  },
});

/** Rebuilds the MUI theme whenever the light/dark toggle flips. */
function MuiThemeBridge({ children }: { children: React.ReactNode }) {
  const { mode } = useThemeMode();
  const theme = useMemo(() => buildTheme(mode), [mode]);
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

// Resolve online/offline (may probe SIREN's backend once for direct-IP access)
// BEFORE first render, so every synchronous isOnLine() call in AuthProvider
// sees a settled value.
resolveOnlineStatus().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ThemeModeProvider>
        <AuthProvider>
          <MuiThemeBridge>
            <PlatformPreferencesSync />
            <QueryClientProvider client={queryClient}>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </QueryClientProvider>
          </MuiThemeBridge>
        </AuthProvider>
      </ThemeModeProvider>
    </React.StrictMode>,
  );
});
