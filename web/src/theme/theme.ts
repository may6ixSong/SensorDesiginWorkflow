import { createTheme } from '@mui/material/styles';
import { FONT_MONO, FONT_SANS, T } from './tokens';

export { T, FONT_MONO, FONT_SANS } from './tokens';
/** 하위호환 별칭 - 기존 코드가 참조하던 이름. */
export const tokens = T;

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: T.tl, dark: '#0bab90', light: T.tl2, contrastText: '#fff' },
    secondary: { main: T.vi },
    error: { main: T.rd },
    warning: { main: T.am },
    info: { main: T.bl },
    background: { default: T.bg, paper: T.sf },
    text: { primary: T.tx, secondary: T.dm, disabled: T.dm2 },
    divider: T.ln,
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
        '@keyframes arborPop': {
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
          boxShadow: '0 28px 60px rgba(20,32,47,.27)',
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: { background: 'rgba(20,32,47,.35)', backdropFilter: 'blur(2px)' },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          background: T.tx,
          fontSize: 11.5,
          padding: '4px 9px',
          borderRadius: 6,
          boxShadow: T.sm,
        },
        arrow: { color: T.tx },
      },
    },
  },
});
