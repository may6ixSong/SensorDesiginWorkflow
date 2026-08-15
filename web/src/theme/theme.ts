import { createTheme } from '@mui/material/styles';

/**
 * 색상 토큰. 원래 정본은 목업(analog-dashboard-v15.html)의 CSS 변수여야 하지만
 * 이번 세션에는 목업 파일이 첨부되지 않아, 설계서(§1.2 Light 테마 전제)에 맞춰
 * 합리적인 기본값으로 새로 정의했다. 실제 목업 파일을 받으면 이 파일의 값만 교체하면 된다.
 */
export const tokens = {
  bg: '#f5f7fa',
  surface: '#ffffff',
  surfaceAlt: '#eef1f6',
  border: '#dde3ec',
  text: '#1b2430',
  textMuted: '#6b7686',
  primary: '#0c9a83',
  primaryDark: '#087a68',
  today: '#fff3cd',
  todayBorder: '#e8b93b',
  laneAlt: '#fbfcfe',
  edgeDefault: '#9aa5b1',
  edgeHighlight: '#0c9a83',
  edgeBidirectional: '#e07a1f',
  networkOA: '#2f6fed',
  networkHPC: '#7a4fd6',
  danger: '#d33f3f',
};

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: tokens.primary, dark: tokens.primaryDark },
    background: { default: tokens.bg, paper: tokens.surface },
    text: { primary: tokens.text, secondary: tokens.textMuted },
    error: { main: tokens.danger },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: [
      'Pretendard',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      'sans-serif',
    ].join(','),
    fontSize: 13,
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
  },
});
