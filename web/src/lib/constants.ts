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

export const NW = 200;
export const NH = 108;
export const MW = 200;
export const MH = 80;
export const MINW = 160;
export const MINH = 76;
export const MAXW = 420;
export const MAXH = 300;

export const WALL_FORCE = 50;
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 2.2;
export const ZOOM_STEP = 0.08;

/** Phase 레인 좌우 여백 — flow 화살표 공간 */
export const LANE_PAD = 46;
/** 기본 레인 폭 — NW 기준으로 블록 2열 + 레인 패딩이 들어오는 폭 */
export const DEFAULT_PW = Math.round((NW + LANE_PAD * 2) * 2 * 0.72);

/** 캔버스 우측 여유폭 (목업의 `G.__tot + 120`) */
export const CANVAS_TAIL = 120;

export const snp = (v: number) => Math.round(v / GRID) * GRID;
