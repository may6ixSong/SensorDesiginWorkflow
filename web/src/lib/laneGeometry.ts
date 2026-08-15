import { PhaseRef } from '@/types/domain';
import { LANE_COLS_MID_DAYS, LANE_COLS_WIDE_DAYS, LANE_MIN_WIDTH, NW, LANE_PAD } from './layoutConstants';

export interface LaneGeom {
  key: string;
  label: string;
  start: Date;
  end: Date;
  days: number;
  cols: 1 | 2 | 3;
  width: number;
  /** 캔버스 콘텐츠 좌표계에서 이 레인의 시작 x. */
  x: number;
}

function laneColsForDays(days: number): 1 | 2 | 3 {
  if (days >= LANE_COLS_WIDE_DAYS) return 3;
  if (days >= LANE_COLS_MID_DAYS) return 2;
  return 1;
}

/**
 * Phase 목록 → 레인 지오메트리 배열. 사용자가 편집 모드에서 레인 폭을 드래그로
 * 조절한 결과(overrides)가 있으면 그 값을 우선한다 (§3.7 - 표시 옵션일 뿐 Phase 날짜는 불변).
 */
export function computeLaneGeometry(
  phases: PhaseRef[],
  widthOverrides: Record<string, number> = {},
): LaneGeom[] {
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  let cursor = 0;
  return sorted.map((p) => {
    const start = new Date(p.start);
    const end = new Date(p.end);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    const cols = laneColsForDays(days);
    const naturalWidth = Math.max(LANE_MIN_WIDTH, cols * (NW + LANE_PAD) + LANE_PAD);
    const width = Math.max(widthOverrides[p.key] ?? naturalWidth, minLaneWidth(cols));
    const geom: LaneGeom = { key: p.key, label: p.label, start, end, days, cols, width, x: cursor };
    cursor += width;
    return geom;
  });
}

/** 레인 폭 조절의 최소값 = 그 레인에서 가장 넓은 블록 + 좌우 여백 (§3.7). */
export function minLaneWidth(cols: number, widestBlockW = NW): number {
  return Math.max(widestBlockW + LANE_PAD * 2, cols * (NW + LANE_PAD) + LANE_PAD);
}

export function totalCanvasWidth(lanes: LaneGeom[]): number {
  if (!lanes.length) return 0;
  const last = lanes[lanes.length - 1];
  return last.x + last.width;
}

export function laneForX(lanes: LaneGeom[], x: number): LaneGeom | undefined {
  return lanes.find((l) => x >= l.x && x < l.x + l.width) ?? lanes[lanes.length - 1];
}

export function laneByKey(lanes: LaneGeom[], key: string): LaneGeom | undefined {
  return lanes.find((l) => l.key === key);
}

/** 오늘 날짜를 전체 Phase 구간 안에서 x좌표로 보간 (§7.1 todayX). null이면 범위 밖. */
export function todayX(lanes: LaneGeom[], today: Date = new Date()): number | null {
  const t = today.getTime();
  for (const lane of lanes) {
    const s = lane.start.getTime();
    const e = lane.end.getTime();
    if (t >= s && t <= e) {
      const ratio = e === s ? 0 : (t - s) / (e - s);
      return lane.x + ratio * lane.width;
    }
  }
  if (lanes.length && t < lanes[0].start.getTime()) return lanes[0].x;
  if (lanes.length && t > lanes[lanes.length - 1].end.getTime()) {
    const last = lanes[lanes.length - 1];
    return last.x + last.width;
  }
  return null;
}

export function isTodayInPhase(phase: PhaseRef, today: Date = new Date()): boolean {
  const t = today.getTime();
  return t >= new Date(phase.start).getTime() && t <= new Date(phase.end).getTime();
}
