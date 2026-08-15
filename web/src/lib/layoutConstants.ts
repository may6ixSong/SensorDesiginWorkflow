/**
 * 캔버스 레이아웃 상수.
 * 원래 정본은 목업(analog-dashboard-v15.html)의 JS 상수여야 하지만, 이번 세션에는
 * 목업 파일이 첨부되지 않아 설계서(§3.2, 3.7, 3.8, 7.1)의 서술과 seed 데이터의
 * 기본 블록 크기(160x82)에 맞춰 합리적인 기본값으로 재정의했다. 실제 목업을 받으면
 * 이 파일의 숫자만 교체하면 동작이 1:1로 맞아떨어지도록 사용처를 이 상수로 통일했다.
 */

/** 산출물/메모 블록 기본 폭·높이 (px). */
export const NW = 160;
export const NH = 82;
export const MEMO_NH = 68;

/** 레인(블록) 내부 좌우 여백. */
export const LANE_PAD = 24;

/** 드래그/리사이즈 스냅 격자 크기. */
export const GRID = 8;

/** 가로 스케일(zoom) 하한/상한 - 실제 하한은 뷰포트 폭 대비 minZoom으로 추가 clamp (§7.1). */
export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 2.5;
export const ZOOM_STEP = 0.1;

/** Phase 벽 저항 - 드래그 세션 중 누적 이동량이 이 값을 넘어야 경계를 넘어간다 (§3.7). */
export const PHASE_WALL_RESISTANCE_PX = 50;

/** Auto Fit 지그재그 오프셋 비율 (§3.8) 및 겹침 해소 반복 횟수. */
export const AUTOFIT_ZIGZAG_RATIO = 0.55;
export const AUTOFIT_RESOLVE_PASSES = 8;
export const AUTOFIT_ROW_GAP = NH + 28;

/** Phase 레인 폭 - 기간에 비례한 열 수 (§3.8-4). */
export const LANE_COLS_WIDE_DAYS = 56; // 이상 → 3열
export const LANE_COLS_MID_DAYS = 28; // 이상 → 2열
export const LANE_MIN_WIDTH = NW + LANE_PAD * 2;

/** 캔버스 세로 여백/기본 레인 높이. */
export const LANE_TOP_PAD = 16;
export const LANE_MIN_HEIGHT = 320;

export const PHASE_ORDER = [
  'KO',
  'ML1',
  'AR',
  'ML2',
  'ML3',
  'MDR',
  'ML4',
  'FDR',
  'MTO',
  'Fab out',
] as const;
