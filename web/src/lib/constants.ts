/**
 * 목업(analog-dashboard-v15.html)의 CONSTANTS 블록을 그대로 옮긴 값.
 * 캔버스 좌표계·줌·드래그 동작이 목업과 1:1로 일치하려면 이 값들을 바꾸면 안 된다.
 */
export const GRID = 10;
export const GAP = 10;
export const PAD = 8;
export const CH = 880;
export const ROW_H = 150;
export const TOP_PAD = 40;

export const NW = 160;
export const NH = 82;
export const MW = 160;
export const MH = 68;
export const MINW = 120;
export const MINH = 58;
export const MAXW = 380;
export const MAXH = 260;

export const WALL_FORCE = 50;
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 2.2;
export const ZOOM_STEP = 0.08;

/** Phase 레인 좌우 여백 — flow 화살표 공간 */
export const LANE_PAD = 46;
/** 기본 레인 폭 */
export const DEFAULT_PW = Math.round((180 + LANE_PAD * 2) * 2 * 0.7);

/** 캔버스 우측 여유폭 (목업의 `G.__tot + 120`) */
export const CANVAS_TAIL = 120;

export const snp = (v: number) => Math.round(v / GRID) * GRID;
