/**
 * Design tokens. Every value is a CSS custom property reference so a single
 * `data-theme` attribute swap (see ThemeModeContext) re-themes the whole app —
 * no component needs to know which mode is active.
 * Actual light/dark values live in `themeVars.ts`.
 */
export const T = {
  bg: 'var(--acro-bg)',
  sf: 'var(--acro-sf)',
  sf2: 'var(--acro-sf2)',
  sf3: 'var(--acro-sf3)',

  ln: 'var(--acro-ln)',
  ln2: 'var(--acro-ln2)',
  ln3: 'var(--acro-ln3)',

  tx: 'var(--acro-tx)',
  dm: 'var(--acro-dm)',
  dm2: 'var(--acro-dm2)',

  tl: 'var(--acro-tl)',
  tl2: 'var(--acro-tl2)',
  tl3: 'var(--acro-tl3)',
  tlHover: 'var(--acro-tl-hover)',

  am: 'var(--acro-am)',
  am2: 'var(--acro-am2)',
  am3: 'var(--acro-am3)',

  vi: 'var(--acro-vi)',
  vi2: 'var(--acro-vi2)',
  vi3: 'var(--acro-vi3)',

  hp: 'var(--acro-hp)',
  hp2: 'var(--acro-hp2)',
  hp3: 'var(--acro-hp3)',

  bl: 'var(--acro-bl)',
  rd: 'var(--acro-rd)',

  ss: 'var(--acro-shadow-ss)',
  sm: 'var(--acro-shadow-sm)',
  sl: 'var(--acro-shadow-sl)',
  shadowDialog: 'var(--acro-shadow-dialog)',
  backdrop: 'var(--acro-backdrop)',

  memoA: 'var(--acro-memo-a)',
  memoB: 'var(--acro-memo-b)',

  hldChanged: 'var(--acro-hld-changed)',
  hldChangedHover: 'var(--acro-hld-changed-hover)',
} as const;

export const FONT_SANS = "'IBM Plex Sans KR',system-ui,sans-serif";
export const FONT_MONO = "'IBM Plex Mono',monospace";
export const FONT_DISPLAY = "'Syne',sans-serif";
