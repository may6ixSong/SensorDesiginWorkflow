import { createTheme, Theme } from '@mui/material/styles';
import { FONT_SANS, R, T } from './tokens';
import { ThemeMode } from './themeVars';

export { T, TIER_COLOR, R, SP, FONT_MONO, FONT_SANS, TNUM, CURSOR_POINTER, FOCUS_RING } from './tokens';

/**
 * MUI는 `palette.*` 위에서 자체 색 연산(lighten/darken/contrast)을 돌리는데, 그게
 * `var(...)` 참조를 못 씹는다 — 리터럴 색이 필요하다. 그래서 팔레트에 들어가는 값만
 * index.html의 커스텀 프로퍼티를 모드별로 복제해 둔다. 그 외의 모든 자리는 T.*(CSS 변수)를
 * 직접 쓰므로 이런 중복이 필요 없다.
 *
 * ★ 여기 값을 바꾸면 index.html의 같은 이름 변수도 함께 바꿔야 한다.
 */
const PALETTE_HEX: Record<
  ThemeMode,
  {
    pr: string; prHover: string; prSoft: string;
    ok: string; warn: string; danger: string; info: string;
    bg: string; sf: string; tx: string; dm: string; dm2: string; ln: string;
  }
> = {
  light: {
    pr: '#4a3fd0', prHover: '#3d33b4', prSoft: '#ecebfb',
    ok: '#0e8f66', warn: '#a35a06', danger: '#cf3341', info: '#2563eb',
    bg: '#f3f4f9', sf: '#ffffff', tx: '#0f1322', dm: '#5b6480', dm2: '#8e96ad', ln: '#e5e8f1',
  },
  dark: {
    pr: '#8f86ff', prHover: '#a49cff', prSoft: '#1d1b3a',
    ok: '#34d399', warn: '#f0b84e', danger: '#ff6b76', info: '#6ea1ff',
    bg: '#0a0c14', sf: '#12151f', tx: '#edeff6', dm: '#98a1b8', dm2: '#6b748d', ln: '#242a3a',
  },
};

/**
 * T.*가 data-theme에 따라 뒤집히는 CSS 변수를 통해 해석되므로, 아래 styleOverrides는
 * 모드마다 달라질 필요가 없다 — `palette.mode`(와 위 PALETTE_HEX)만 바뀐다.
 */
export function buildTheme(mode: ThemeMode): Theme {
  const hex = PALETTE_HEX[mode];
  return createTheme({
    palette: {
      mode,
      primary: { main: hex.pr, dark: hex.prHover, light: hex.prSoft, contrastText: mode === 'light' ? '#fff' : '#0a0c14' },
      success: { main: hex.ok },
      error: { main: hex.danger },
      warning: { main: hex.warn },
      info: { main: hex.info },
      background: { default: hex.bg, paper: hex.sf },
      text: { primary: hex.tx, secondary: hex.dm, disabled: hex.dm2 },
      divider: hex.ln,
    },
    shape: { borderRadius: R.md },
    typography: {
      fontFamily: FONT_SANS,
      fontSize: 14,
      // 화면이 정보 밀도가 높아 자간을 살짝 좁힌다 — 제목일수록 더.
      h1: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' },
      h2: { fontSize: 22, fontWeight: 700, letterSpacing: '-0.018em' },
      h3: { fontSize: 18, fontWeight: 650, letterSpacing: '-0.014em' },
      h4: { fontSize: 15.5, fontWeight: 650, letterSpacing: '-0.01em' },
      body1: { fontSize: 14, lineHeight: 1.55 },
      body2: { fontSize: 13, lineHeight: 1.5 },
      caption: { fontSize: 11.5, lineHeight: 1.45 },
      button: { textTransform: 'none', fontWeight: 600, letterSpacing: 0 },
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
            MozOsxFontSmoothing: 'grayscale',
            // 캔버스 드래그 중 텍스트가 선택되면 조작감이 망가진다. 입력 요소는 아래에서 되살린다.
            userSelect: 'none',
            overflow: 'hidden',
          },
          'input,textarea,[contenteditable="true"]': { userSelect: 'text' },
          '::-webkit-scrollbar': { width: 10, height: 10 },
          '::-webkit-scrollbar-track': { background: 'transparent' },
          '::-webkit-scrollbar-thumb': {
            background: T.ln2,
            borderRadius: R.pill,
            // 트랙 안에서 살짝 떠 보이게 — 스크롤바가 화면을 가르지 않는다.
            border: '3px solid transparent',
            backgroundClip: 'content-box',
          },
          '::-webkit-scrollbar-thumb:hover': { background: T.ln3, backgroundClip: 'content-box' },
          /* 하이라이트된 flow 선의 흐르는 점선. */
          '@keyframes sirenFlowDash': { '0%': { strokeDashoffset: 18 }, to: { strokeDashoffset: 0 } },
          /* 캔버스 편집 모드 바의 은은한 맥동 — "지금 편집 중"을 계속 상기시킨다. */
          '@keyframes sirenPulse': {
            '0%,100%': { opacity: 1 },
            '50%': { opacity: 0.55 },
          },
          'input,select,textarea': { fontFamily: FONT_SANS },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true, disableRipple: true },
        styleOverrides: {
          root: { borderRadius: R.sm, minHeight: 34 },
        },
      },
      MuiIconButton: { defaultProps: { disableRipple: true } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiDialog: {
        styleOverrides: {
          paper: {
            border: `1px solid ${T.ln}`,
            borderRadius: R.xl,
            boxShadow: T.shXl,
            backgroundImage: 'none',
          },
        },
      },
      MuiBackdrop: {
        styleOverrides: {
          root: { background: T.backdrop, backdropFilter: 'blur(3px)' },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          // T.inv를 쓴다(T.tx가 아니라): 툴팁은 두 테마 모두에서 "어두운 알약 + 흰 글자"로
          // 읽혀야 한다. T.tx는 다크에서 거의 흰색으로 뒤집혀 흰 글자와 겹친다.
          tooltip: {
            background: T.inv,
            color: T.invTx,
            fontSize: 11.5,
            fontWeight: 500,
            padding: '5px 10px',
            borderRadius: R.xs,
            boxShadow: T.shMd,
          },
          arrow: { color: T.inv },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: R.md,
            border: `1px solid ${T.ln}`,
            boxShadow: T.shLg,
            backgroundImage: 'none',
          },
        },
      },
    },
  });
}
