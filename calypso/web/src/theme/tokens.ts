/**
 * Design tokens. Every value is a CSS custom property reference so a single
 * `data-theme` attribute swap (see ThemeModeContext) re-themes the whole app —
 * no component needs to know which mode is active.
 * Actual light/dark values live in `themeVars.ts`.
 */
export const T = {
  bg: 'var(--siren-bg)',
  sf: 'var(--siren-sf)',
  sf2: 'var(--siren-sf2)',
  sf3: 'var(--siren-sf3)',

  ln: 'var(--siren-ln)',
  ln2: 'var(--siren-ln2)',
  ln3: 'var(--siren-ln3)',

  tx: 'var(--siren-tx)',
  dm: 'var(--siren-dm)',
  dm2: 'var(--siren-dm2)',
  /** 항상 어두운 표면 — 테마와 무관하게 어두운 배경 위에 흰 글자로 떠 있어야 하는
   * 칩(Toast, 캔버스 "Details" 버튼, 툴팁)용. T.tx처럼 테마에 따라 뒤집히지 않는다. */
  inv: 'var(--siren-inv)',

  tl: 'var(--siren-tl)',
  tl2: 'var(--siren-tl2)',
  tl3: 'var(--siren-tl3)',
  tlHover: 'var(--siren-tl-hover)',

  am: 'var(--siren-am)',
  am2: 'var(--siren-am2)',
  am3: 'var(--siren-am3)',

  vi: 'var(--siren-vi)',
  vi2: 'var(--siren-vi2)',
  vi3: 'var(--siren-vi3)',

  hp: 'var(--siren-hp)',
  hp2: 'var(--siren-hp2)',
  hp3: 'var(--siren-hp3)',

  bl: 'var(--siren-bl)',
  rd: 'var(--siren-rd)',
  /** 유실(일정 없음) 표시용 옅은 배경/테두리 — 캔버스 블록, 타임라인, 3D 뷰가 함께 쓴다. */
  rd2: 'var(--siren-rd2)',
  rd3: 'var(--siren-rd3)',

  ss: 'var(--siren-shadow-ss)',
  sm: 'var(--siren-shadow-sm)',
  sl: 'var(--siren-shadow-sl)',
  shadowDialog: 'var(--siren-shadow-dialog)',
  backdrop: 'var(--siren-backdrop)',

  memoA: 'var(--siren-memo-a)',
  memoB: 'var(--siren-memo-b)',

  hldChanged: 'var(--siren-hld-changed)',
  hldChangedHover: 'var(--siren-hld-changed-hover)',
} as const;

export const FONT_SANS = "'IBM Plex Sans KR',system-ui,sans-serif";
export const FONT_MONO = "'IBM Plex Mono',monospace";
export const FONT_DISPLAY = "'Syne',sans-serif";

/** 회로도풍 커스텀 커서 — 클릭 가능한 컴포넌트에 적용. 기본 화살표 커서는 index.html의 전역 `cursor`로 처리된다. */
export const CURSOR_POINTER = "url('/cursors/pointer.svg') 16 16, pointer";
