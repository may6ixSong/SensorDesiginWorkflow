/**
 * 디자인 토큰. 모든 값이 CSS 커스텀 프로퍼티 참조라, `data-theme` 속성 하나만 바꾸면
 * 앱 전체가 다시 테마링된다 — 컴포넌트는 지금 어느 모드인지 알 필요가 없다.
 *
 * 실제 light/dark 값은 `web/index.html`에 있다. 거기 있어야 하는 이유는 렌더 차단
 * 인라인 스크립트가 첫 페인트 전에 모드를 적용해야 하기 때문이고, 두 곳에 나눠 두면
 * 반드시 어긋나므로 이 파일은 참조만 들고 있는다.
 */
export const T = {
  /* ── 표면 ── 뒤에서 앞으로. 경계선 대신 이 단차로 깊이를 만든다 */
  bg: 'var(--s-bg)',
  sf: 'var(--s-sf)',
  sf2: 'var(--s-sf2)',
  sf3: 'var(--s-sf3)',
  sf4: 'var(--s-sf4)',

  /* ── 경계선 ── 대부분의 자리에는 ln(머리카락 굵기)만 쓴다 */
  ln: 'var(--s-ln)',
  ln2: 'var(--s-ln2)',
  ln3: 'var(--s-ln3)',

  /* ── 글자 ── */
  tx: 'var(--s-tx)',
  tx2: 'var(--s-tx2)',
  dm: 'var(--s-dm)',
  dm2: 'var(--s-dm2)',

  /** 테마와 무관하게 항상 어두운 표면 — 툴팁·토스트처럼 떠 있는 칩용. */
  inv: 'var(--s-inv)',
  invTx: 'var(--s-inv-tx)',

  /* ── 강조(인디고). 색으로 의미를 나르는 자리는 tier/상태 토큰에만 허용한다 ── */
  pr: 'var(--s-pr)',
  prHover: 'var(--s-pr-hover)',
  prSoft: 'var(--s-pr-soft)',
  prLine: 'var(--s-pr-line)',
  prTx: 'var(--s-pr-tx)',

  /* ── 상태 ── */
  ok: 'var(--s-ok)',
  okSoft: 'var(--s-ok-soft)',
  okLine: 'var(--s-ok-line)',
  warn: 'var(--s-warn)',
  warnSoft: 'var(--s-warn-soft)',
  warnLine: 'var(--s-warn-line)',
  danger: 'var(--s-danger)',
  dangerSoft: 'var(--s-danger-soft)',
  dangerLine: 'var(--s-danger-line)',
  info: 'var(--s-info)',
  infoSoft: 'var(--s-info-soft)',
  infoLine: 'var(--s-info-line)',

  /** release 표에서 "이전 대비 바뀐 행" 단일 하이라이트(신규/변경을 색으로 나누지 않는다). */
  changed: 'var(--s-changed)',
  changedLine: 'var(--s-changed-line)',

  /* ── 캔버스 ── */
  canvasBg: 'var(--s-canvas-bg)',
  canvasGrid: 'var(--s-canvas-grid)',
  canvasEditBg: 'var(--s-canvas-edit-bg)',
  canvasEditGrid: 'var(--s-canvas-edit-grid)',
  canvasEditLine: 'var(--s-canvas-edit-line)',
  memo: 'var(--s-memo)',
  memoLine: 'var(--s-memo-line)',

  /* ── 그림자 ── */
  shXs: 'var(--s-sh-xs)',
  shSm: 'var(--s-sh-sm)',
  shMd: 'var(--s-sh-md)',
  shLg: 'var(--s-sh-lg)',
  shXl: 'var(--s-sh-xl)',
  backdrop: 'var(--s-backdrop)',
  ring: 'var(--s-ring)',
} as const;

/**
 * Tier 색 — A→D 신뢰도 내림차순이 색에서 읽혀야 한다.
 * 배지·캔버스 블록·release 표가 전부 이 한 곳을 참조한다.
 */
export const TIER_COLOR: Record<'A' | 'B' | 'C' | 'D', { fg: string; bg: string }> = {
  A: { fg: 'var(--s-tier-a)', bg: 'var(--s-tier-a-soft)' },
  B: { fg: 'var(--s-tier-b)', bg: 'var(--s-tier-b-soft)' },
  C: { fg: 'var(--s-tier-c)', bg: 'var(--s-tier-c-soft)' },
  D: { fg: 'var(--s-tier-d)', bg: 'var(--s-tier-d-soft)' },
};

/** 라운드 — 12(md)가 기본이다. 카드·다이얼로그는 한 단계 크게 간다. */
export const R = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/** 간격 — 4의 배수. sx에 숫자를 직접 쓰지 않고 이걸 참조한다. */
export const SP = {
  '0.5': 2,
  1: 4,
  1.5: 6,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const FONT_SANS =
  "'Pretendard Variable',Pretendard,'IBM Plex Sans KR',-apple-system,BlinkMacSystemFont,system-ui,sans-serif";
export const FONT_MONO = "'JetBrains Mono','IBM Plex Mono',ui-monospace,monospace";
export const FONT_DISPLAY = "'Syne',sans-serif";

/**
 * 숫자가 자리를 지켜야 읽기 편한 곳(버전·날짜·카운트)에 붙인다.
 * 값이 갱신될 때 옆 글자가 밀리지 않는다.
 */
export const TNUM = { fontVariantNumeric: 'tabular-nums' } as const;

/**
 * 커스텀 포인터(손가락) 커서 — 기본 화살표는 index.html의 전역 규칙이 처리한다.
 *
 * ★ hotspot(12 5)은 pointer.svg의 손끝 좌표다. index.html의 전역 커서 규칙과
 *   **반드시 같은 값**이어야 한다 — 다르면 이 상수를 쓰는 요소(캔버스 블록 등)
 *   위에서만 클릭점이 손끝이 아닌 다른 자리로 어긋난다.
 */
export const CURSOR_POINTER = "url('/cursors/pointer.svg') 12 5, pointer";

/** 포커스 링 — 키보드 사용자를 위해 모든 인터랙티브 요소가 같은 모양을 쓴다. */
export const FOCUS_RING = {
  outline: 'none',
  boxShadow: `0 0 0 3px ${T.ring}`,
} as const;
