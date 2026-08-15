import { Layout } from '@/types/domain';
import { LaneGeom } from './laneGeometry';
import { computeFlowDepth, FlowEdgeLike } from './flowDepth';
import {
  AUTOFIT_RESOLVE_PASSES,
  AUTOFIT_ROW_GAP,
  AUTOFIT_ZIGZAG_RATIO,
  LANE_PAD,
  LANE_TOP_PAD,
  NH,
  NW,
} from './layoutConstants';

export interface AutoFitBlock {
  id: string;
  phaseKey: string;
  layout: Layout;
}

function rectsOverlap(a: Layout, b: Layout): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 같은 Phase 레인 안에서만 8회 반복 패스로 겹침을 해소한다 (설계서 3.8-5). */
function resolveOverlapsInLane(items: (Layout & { id: string })[]) {
  for (let pass = 0; pass < AUTOFIT_RESOLVE_PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (rectsOverlap(a, b)) {
          b.y = a.y + a.h + 12;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

/**
 * Auto Fit(정리 기능) - 사용자가 명시적으로 누를 때만 동작 (설계서 3.8).
 * 1) flow 그래프 위상 정렬로 depth 산출 (순환은 뒤로 밀림)
 * 2) 같은 Phase 레인 안에서 depth 짝수=왼쪽 정렬, 홀수=블록폭*0.55 오른쪽 오프셋(지그재그)
 * 3) 같은 Phase 블록끼리만 겹침을 8회 반복 패스로 해소
 *
 * 반환값은 블록 id → 캔버스 전체 좌표계 기준 새 Layout(겹침 없음, x는 lane.x 포함).
 */
export function computeAutoFit(
  blocks: AutoFitBlock[],
  edges: FlowEdgeLike[],
  lanes: LaneGeom[],
): Map<string, Layout> {
  const { depth } = computeFlowDepth(
    blocks.map((b) => b.id),
    edges,
  );

  const byPhase = new Map<string, AutoFitBlock[]>();
  for (const b of blocks) {
    if (!byPhase.has(b.phaseKey)) byPhase.set(b.phaseKey, []);
    byPhase.get(b.phaseKey)!.push(b);
  }

  const result = new Map<string, Layout>();

  for (const lane of lanes) {
    const group = (byPhase.get(lane.key) ?? [])
      .slice()
      .sort((a, b) => (depth.get(a.id) ?? 1) - (depth.get(b.id) ?? 1));

    let row = 0;
    let lastDepth: number | null = null;
    const placedLocal: (Layout & { id: string })[] = [];

    for (const block of group) {
      const dep = depth.get(block.id) ?? 1;
      if (lastDepth !== null && dep !== lastDepth) row++;
      lastDepth = dep;

      const w = block.layout.w || NW;
      const h = block.layout.h || NH;
      const zigzagOffset = dep % 2 === 0 ? Math.round(w * AUTOFIT_ZIGZAG_RATIO) : 0;
      const local: Layout & { id: string } = {
        id: block.id,
        x: LANE_PAD + zigzagOffset,
        y: LANE_TOP_PAD + row * AUTOFIT_ROW_GAP,
        w,
        h,
      };
      placedLocal.push(local);
    }

    resolveOverlapsInLane(placedLocal);

    for (const local of placedLocal) {
      result.set(local.id, { x: lane.x + local.x, y: local.y, w: local.w, h: local.h });
    }
  }

  return result;
}
