import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { buildTheme } from './theme/theme';
import { ThemeModeProvider, useThemeMode } from './theme/ThemeModeContext';
import { LanguageProvider } from './i18n/LanguageContext';
import App from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeModeProvider>
      <LanguageProvider>
        <MuiThemeBridge>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        </MuiThemeBridge>
      </LanguageProvider>
    </ThemeModeProvider>
  </React.StrictMode>,
);
