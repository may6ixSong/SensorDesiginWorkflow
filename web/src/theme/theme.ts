import { createTheme, Theme } from '@mui/material/styles';
import { FONT_MONO, FONT_SANS, T } from './tokens';
import { ThemeMode } from './themeVars';

export { T, FONT_MONO, FONT_SANS } from './tokens';
/** 하위호환 별칭 - 기존 코드가 참조하던 이름. */
export const tokens = T;

/**
 * MUI runs its own color math (lighten/darken/contrast) on `palette.*`, which
 * chokes on `var(...)` references — it needs literal colors. These mirror the
 * CSS custom properties in index.html per mode; everywhere else in the app
 * uses T.* (CSS vars) directly and needs no such duplication.
 */
const PALETTE_HEX: Record<ThemeMode, {
  tl: string; tl2: string; tlHover: string; vi: string; rd: string; am: string; bl: string;
  bg: string; sf: string; tx: string; dm: string; dm2: string; ln: string;
}> = {
  light: {
    tl: '#0c9a83', tl2: '#e0f5f0', tlHover: '#0bab90', vi: '#5849cf', rd: '#c8352c',
    am: '#ac6f08', bl: '#2563c9', bg: '#eceff5', sf: '#ffffff', tx: '#14202f',
    dm: '#5c6d84', dm2: '#8b99ab', ln: '#dde4ee',
  },
  dark: {
    tl: '#2ee6c5', tl2: '#123a34', tlHover: '#23c9ac', vi: '#9a8bff', rd: '#ff6b62',
    am: '#f0b84e', bl: '#6ea1ff', bg: '#0b0e15', sf: '#141924', tx: '#eef2f8',
    dm: '#9aa7bd', dm2: '#6b7891', ln: '#262f3f',
  },
};

/**
 * T.* resolves through CSS variables that flip with data-theme, so styleOverrides
 * below never need to change per mode — only `palette.mode` (and PALETTE_HEX above,
 * for the reason noted there) does.
 */
export function buildTheme(mode: ThemeMode): Theme {
  const hex = PALETTE_HEX[mode];
  return createTheme({
  palette: {
    mode,
    primary: { main: hex.tl, dark: hex.tlHover, light: hex.tl2, contrastText: '#fff' },
    secondary: { main: hex.vi },
    error: { main: hex.rd },
    warning: { main: hex.am },
    info: { main: hex.bl },
    background: { default: hex.bg, paper: hex.sf },
    text: { primary: hex.tx, secondary: hex.dm, disabled: hex.dm2 },
    divider: hex.ln,
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: FONT_SANS,
    fontSize: 14,
    button: { textTransform: 'none', fontWeight: 500 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        'html,body,#root': { height: '100%' },
        body: {
          background: T.bg,
          color: T.tx,
          fontSize: 14,
          WebkitFontSmoothing: 'antialiased',
          userSelect: 'none',
          overflow: 'hidden',
        },
        '::-webkit-scrollbar': { width: 7, height: 7 },
        '::-webkit-scrollbar-thumb': { background: T.ln2, borderRadius: 7 },
        // 하이라이트된 flow 선의 흐르는 점선 (목업 @keyframes flowdash)
        '@keyframes flowdash': { '0%': { strokeDashoffset: 18 }, to: { strokeDashoffset: 0 } },
        // 상세 버튼 등장 (목업 @keyframes pop)
        '@keyframes acroPop': {
          from: { opacity: 0, transform: 'translateX(-50%) translateY(4px)' },
          to: { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
        },
        'input,select,textarea': { fontFamily: FONT_SANS },
      },
    },
    MuiButton: { defaultProps: { disableElevation: true, disableRipple: true } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiDialog: {
      styleOverrides: {
        paper: {
          border: `1px solid ${T.ln2}`,
          borderRadius: 14,
          boxShadow: 'var(--acro-shadow-dialog)',
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: { background: 'var(--acro-backdrop)', backdropFilter: 'blur(2px)' },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        // T.inv (not T.tx): a tooltip is meant to read as a fixed dark pill with
        // white text in both themes — T.tx flips to near-white in dark mode, which
        // paired with MUI's light tooltip text would make it unreadable.
        tooltip: {
          background: T.inv,
          color: '#fff',
          fontSize: 11.5,
          padding: '4px 9px',
          borderRadius: 6,
          boxShadow: T.sm,
        },
        arrow: { color: T.inv },
      },
    },
  },
  });
}
