/**
 * 목업(analog-dashboard-v15.html)의 CONSTANTS 블록을 그대로 옮긴 값에서, 기본 줌을
 * 낮추면서(아래 ZOOM_DEFAULT_FLOOR) 블록/폰트가 작아 보이지 않도록 전체를 약
 * 1.47배(= 옛 기본 줌 0.75 / 새 기본 줌 0.51) 키운 값이다. 캔버스 좌표계·줌·드래그
 * 동작의 "비율"은 목업과 동일하게 유지되지만 절대 픽셀 값은 다르다.
 * ⚠ api/src/database/seed-data.ts가 이 값들의 사본(GRID/ROW_H/TOP_PAD/NW/NH/
 * LANE_PAD/DEFAULT_PW/MW/MH)을 갖고 있다 — 여기를 바꾸면 반드시 그쪽도 같이 바꿀 것
 * (안 그러면 시드 산출물이 의도한 Phase 레인을 벗어나 옆 레인과 겹쳐 보인다).
 */
export const GRID = 10;
export const GAP = 15;
export const PAD = 12;
export const CH = 1300;
export const ROW_H = 220;
export const TOP_PAD = 60;

export const NW = 295;
export const NH = 160;
export const MW = 295;
export const MH = 120;
export const MINW = 235;
export const MINH = 110;
export const MAXW = 620;
export const MAXH = 440;

export const WALL_FORCE = 75;
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 2.2;
export const ZOOM_STEP = 0.08;
/**
 * 보드 진입 시 기본 줌의 하한 — 옛 기본값 0.75에서 마우스 휠로 3칸 줌아웃(0.51)한 뒤,
 * 다시 1칸 줌인(+ZOOM_STEP)한 값을 최종 기본값으로 삼는다(사용자 요청). 콘텐츠가
 * 뷰포트보다 작은 소규모 IP는 여전히 그보다 확대된 값(containZ)을 쓴다 — Canvas.tsx 참고.
 */
export const ZOOM_DEFAULT_FLOOR = 0.59;

/** Phase 레인 좌우 여백 — flow 화살표 공간 */
export const LANE_PAD = 68;
/** 기본 레인 폭 — NW 기준으로 블록 2열 + 레인 패딩이 들어오는 폭 */
export const DEFAULT_PW = Math.round((NW + LANE_PAD * 2) * 2 * 0.72);

/** 캔버스 우측 여유폭 (목업의 `G.__tot + 120`) */
export const CANVAS_TAIL = 180;

export const snp = (v: number) => Math.round(v / GRID) * GRID;
