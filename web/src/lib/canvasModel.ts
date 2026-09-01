/**
 * 캔버스 작업 모델 + 순수 계산 로직.
 * 목업(analog-dashboard-v15.html)의 laneG/phaseAtX/resolve/wallAdj/
 * connectedSet/orth/stOf/todayX 를 1:1로 이식한 것이다(autoFit은 이후 제거, 부록 A.7).
 * reflowLane(레인 재배치)은 겹침 허용 결정 이후 제거됨.
 *
 * 설계서 1.3·5.5에 따라 이 계산은 전부 FE에서 완결되고, BE는 결과 좌표만 저장한다.
 */
import { DeliverableDto, EdgeDto, MemoDto, WorkflowPhase } from '@/types/domain';
import { DAY_MS, dayMs, matchPhaseByDate } from './schedule';
import {
  DEFAULT_PW, GAP, LANE_PAD, MH, MW, NH, NW, ROW_H, TOP_PAD, WALL_FORCE, snp,
} from './constants';
import { T } from '@/theme/tokens';

/* ── 작업 모델 (목업의 ITEMS/NOTES/EDGES 원소와 같은 모양) ── */
export interface VersionView {
  major: number;
  minor: number;
  kind: 'major' | 'minor';
  file: string;
  note: string;
  by: string;
  at: string;
}

export interface CanvasNode {
  id: string;
  workflow: string;
  /**
   * 이 산출물이 걸려 있는 phase의 id. 소유 workflow의 phase 목록에 없으면 "일정 유실"
   * 상태다 — 캔버스는 좌표를 그대로 두고 유실 표시만 붙인다(isOrphanPhase 참고).
   * origin==='incoming'이면 주는 쪽 phase가 아니라, sourcePhase의 날짜로 골라낸
   * "내 phase" id가 들어간다(placeIncomingNodes).
   */
  phase: string;
  name: string;
  /** name과 분리된 안정적 식별자 — 향후 외부 시스템 연동용 매핑 키. 미지정이면 null. */
  artifactKey: string | null;
  type: string;
  net: 'OA' | 'HPC';
  series: string | null;
  seriesIdx: number;
  seriesTotal: number;
  recvDept: string | null;
  recvContact: string | null;
  /** 이 산출물을 받아야 하는 다른 Analog workflow. */
  recvWorkflowId: string | null;
  /** 이 시스템에 없는 외부 부서로부터 받았음을 나타내는 자유 텍스트 — own 그대로라 자유 편집 가능. */
  sourceDept: string | null;
  /** 받을 때의 개별 연락처 — 자유 텍스트. */
  sourceContact: string | null;
  /** 'incoming'이면 다른 IP가 이 IP로 보낸 산출물 — 드래그/리사이즈 불가, 저장 대상 아님. */
  origin: 'own' | 'incoming';
  /** origin==='incoming'일 때만 채워진다 — 이 산출물을 준 workflow. */
  sourceWorkflow: { id: string; name: string; color: string } | null;
  /** origin==='incoming'일 때만 채워진다 — 주는 쪽 workflow에서의 일정 구간. */
  sourcePhase: WorkflowPhase | null;
  versions: VersionView[];
  canEdit: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CanvasMemo {
  id: string;
  workflow: string;
  phase: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  auto: boolean;
  /** BE가 명시적 플래그로 저장한 양방향(설계서 4.8). 목업식 역방향 쌍도 함께 지원한다. */
  bidirectional: boolean;
}

export interface CanvasData {
  nodes: CanvasNode[];
  memos: CanvasMemo[];
  edges: CanvasEdge[];
}

/* ── DTO → 작업 모델 ── */
/**
 * origin='incoming'이면 다른 IP가 준 산출물 — 그 IP의 layout(x,y,w,h)은 이 캔버스와
 * 무관하므로 기본 크기로 시작해 placeIncomingNodes()가 매 hydrate마다 위치를 다시 계산한다.
 */
export function toCanvasNode(d: DeliverableDto, origin: 'own' | 'incoming' = 'own'): CanvasNode {
  return {
    id: d.id,
    workflow: d.workflowId,
    phase: d.phaseId,
    name: d.name,
    artifactKey: d.artifactKey ?? null,
    type: d.docType,
    net: d.network,
    series: d.series,
    seriesIdx: d.seriesIdx,
    seriesTotal: d.seriesTotal,
    recvDept: d.recvDept,
    recvContact: d.recvContact,
    recvWorkflowId: d.recvWorkflowId,
    sourceDept: d.sourceDept ?? null,
    sourceContact: d.sourceContact ?? null,
    origin,
    sourceWorkflow: d.sourceWorkflow ?? null,
    sourcePhase: d.sourcePhase ?? null,
    versions: d.versions ?? [],
    canEdit: d.canEdit,
    x: origin === 'incoming' ? 0 : d.layout?.x ?? 0,
    y: origin === 'incoming' ? 0 : d.layout?.y ?? 0,
    w: origin === 'incoming' ? NW : d.layout?.w || NW,
    h: origin === 'incoming' ? NH : d.layout?.h || NH,
  };
}
export function toCanvasMemo(m: MemoDto): CanvasMemo {
  return {
    id: m._id,
    workflow: m.workflowId,
    phase: m.phaseId,
    text: m.text,
    x: m.layout?.x ?? 0,
    y: m.layout?.y ?? 0,
    w: m.layout?.w || MW,
    h: m.layout?.h || MH,
  };
}
export function toCanvasEdge(e: EdgeDto): CanvasEdge {
  return { id: e._id, from: e.fromId, to: e.toId, auto: e.auto, bidirectional: e.bidirectional };
}

/* ── 레인 지오메트리 ── */
export const getPW = (phasePW: Record<string, number>, id: string) => phasePW[id] || DEFAULT_PW;

/** 목업 laneG(): Phase 순서대로 x를 누적. __tot은 전체 폭. */
export function laneG(phases: WorkflowPhase[], phasePW: Record<string, number>) {
  let x = 0;
  const o: Record<string, { x: number; w: number }> = {};
  phases.forEach((p) => {
    const w = getPW(phasePW, p.id);
    o[p.id] = { x, w };
    x += w;
  });
  return { lanes: o, total: x };
}

/**
 * 이 phaseId를 가진 산출물이 "일정을 잃었는지" — 지금 workflow의 phase 목록에 그 id가
 * 없으면 유실이다. phase를 지워도 서버가 산출물을 옮기거나 지우지 않기 때문에 생기는
 * 상태이고(사용자 요청), 캔버스는 좌표를 그대로 둔 채 표시만 다르게 한다. 같은 id의
 * phase가 다시 생기면 아무 조작 없이 원래대로 붙는다.
 */
export function isOrphanPhase(phases: WorkflowPhase[], phaseId: string): boolean {
  return !phases.some((p) => p.id === phaseId);
}

/** 유실된 산출물이 몇 개인지 — 툴바/토스트 문구용. */
export function countOrphans(nodes: CanvasNode[], phases: WorkflowPhase[]): number {
  return nodes.filter((n) => n.origin !== 'incoming' && isOrphanPhase(phases, n.phase)).length;
}

/** x 좌표가 속한 Phase id (목업 phaseAtX) */
export function phaseAtX(phases: WorkflowPhase[], phasePW: Record<string, number>, cx: number): string {
  const { lanes } = laneG(phases, phasePW);
  for (const p of phases) {
    const g = lanes[p.id];
    if (cx >= g.x && cx < g.x + g.w) return p.id;
  }
  return cx < 0 ? phases[0].id : phases[phases.length - 1].id;
}

type Blk = { id: string; phase: string; x: number; y: number; w: number; h: number };

/**
 * 새로 생성된 블록을 지정된 Phase 레인 안쪽(좌상단)에 배치한다.
 * 백엔드가 내려주는 기본 layout(0,0)은 Phase를 모르므로, FE에서 레인 좌표로 보정해야
 * `phase` 필드와 실제 x 좌표가 어긋나 엉뚱한 레인에 그려지는 것을 막는다.
 */
export function placeInLane(
  block: { x: number; y: number; phase: string },
  phases: WorkflowPhase[],
  phasePW: Record<string, number>,
): void {
  const g = laneG(phases, phasePW).lanes[block.phase];
  if (!g) return;
  block.x = snp(g.x + LANE_PAD);
  block.y = snp(TOP_PAD);
}

/**
 * origin==='incoming' 노드(다른 workflow가 이 workflow에 보낸 산출물)는 이 캔버스의 저장
 * 대상이 아니므로 서버에 위치가 없다 — 매 hydrate마다 이 함수로 다시 계산한다. own 노드의
 * 위치(사용자가 드래그해 저장한 값)는 절대 건드리지 않고, incoming 노드만 레인 안에서
 * own/다른 incoming 노드와 겹치지 않는 첫 빈 자리(위→아래 탐색)에 놓는다. 그래서 own
 * 노드들 사이에 실제로 "섞여" 보이고, edge로 자유롭게 연결할 수 있다.
 *
 * ★ 어느 레인에 놓을지는 날짜로 정한다. incoming 산출물이 들고 오는 phaseId는 "주는 쪽
 *   workflow"의 것이라 내 phase 목록에는 아예 없다(phase가 workflow마다 다르므로).
 *   그래서 함께 받은 sourcePhase의 종료일이 내 어느 phase 구간에 들어오는지로 고르고,
 *   어디에도 안 들어오면 가장 가까운 phase로 붙인다(lib/schedule.ts의 matchPhaseByDate).
 */
export function placeIncomingNodes(
  nodes: CanvasNode[],
  phases: WorkflowPhase[],
  phasePW: Record<string, number>,
): void {
  const { lanes } = laneG(phases, phasePW);
  const placedByPhase = new Map<string, { x: number; y: number; w: number; h: number }[]>();
  nodes
    .filter((n) => n.origin !== 'incoming')
    .forEach((n) => {
      const arr = placedByPhase.get(n.phase) ?? [];
      arr.push({ x: n.x, y: n.y, w: n.w, h: n.h });
      placedByPhase.set(n.phase, arr);
    });

  nodes
    .filter((n) => n.origin === 'incoming')
    .sort((a, b) => a.id.localeCompare(b.id))
    .forEach((n) => {
      const localPhase = matchPhaseByDate(phases, n.sourcePhase);
      if (!localPhase) return;
      n.phase = localPhase;
      const g = lanes[n.phase];
      if (!g) return;
      const placed = placedByPhase.get(n.phase) ?? [];
      const x = snp(g.x + LANE_PAD);
      let y = TOP_PAD;
      for (let guard = 0; guard < 200; guard++) {
        const collides = placed.some(
          (p) => x < p.x + p.w + GAP && x + n.w + GAP > p.x && y < p.y + p.h + GAP && y + n.h + GAP > p.y,
        );
        if (!collides) break;
        y += ROW_H;
      }
      n.x = x;
      n.y = snp(y);
      placed.push({ x: n.x, y: n.y, w: n.w, h: n.h });
      placedByPhase.set(n.phase, placed);
    });
}

/**
 * 편집 완료 시 1회만 호출 — 각 노드가 가장 많이 겹치는 phase 레인을 찾아 `phase`
 * 필드(소속 표시·필터링용 메타데이터)만 확정한다. 겹침이 허용되므로 좌표는 절대
 * 건드리지 않는다: 내가 직접 드래그하지 않은 다른 노드가 "제멋대로" 움직이는 일이
 * 없어야 한다 — 이 함수는 항상 내가 옮긴 노드만 만지고, 나머지는 순수 조회만 한다.
 *
 * ★ 일정을 잃은 산출물(isOrphanPhase)은 건너뛴다. 사라진 phase 자리에 그대로 남아 있는
 *   좌표가 우연히 옆 레인과 겹친다는 이유로 그 phase에 흡수돼 버리면, 사용자가 유실
 *   사실을 알아채기도 전에 표시가 사라진다. 다시 일정을 잡는 것은 산출물 상세의
 *   "Release schedule"에서 명시적으로만 한다.
 */
export function resolveNodePhases(
  nodes: CanvasNode[],
  phases: WorkflowPhase[],
  phasePW: Record<string, number>,
): { reassigned: number } {
  if (!phases.length) return { reassigned: 0 };
  const { lanes } = laneG(phases, phasePW);
  let reassigned = 0;

  nodes.forEach((n) => {
    if (isOrphanPhase(phases, n.phase)) return;
    let bestId = phases[0].id;
    let bestOverlap = -Infinity;
    phases.forEach((p) => {
      const g = lanes[p.id];
      const overlap = Math.min(n.x + n.w, g.x + g.w) - Math.max(n.x, g.x);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestId = p.id;
      }
    });

    if (n.phase !== bestId) {
      n.phase = bestId;
      reassigned++;
    }
  });

  return { reassigned };
}

/** Phase 최소 폭 (목업 minPW) */
export function minPW(blocks: Blk[], pid: string) {
  const maxW = blocks.filter((b) => b.phase === pid).reduce((m, b) => Math.max(m, b.w || NW), NW);
  return Math.max(maxW + LANE_PAD * 2 + GAP, 240);
}

/**
 * Phase 폭 변경. phasePW만 갱신하고 blocks는 절대 건드리지 않는다 — 겹침이
 * 허용되므로(사용자 요청) 폭을 조절해도 내가 직접 옮기지 않은 블록은 제자리에
 * 그대로 남아야 한다. 레인 배경/경계만 새 폭을 따라 다시 그려진다.
 */
export function resizePhase(
  blocks: Blk[],
  phases: WorkflowPhase[],
  phasePW: Record<string, number>,
  pid: string,
  rawNewW: number,
): Record<string, number> {
  const idx = phases.findIndex((p) => p.id === pid);
  if (idx < 0) return phasePW;

  const nw = Math.max(minPW(blocks, pid), Math.round(rawNewW));
  const oldW = getPW(phasePW, pid);
  if (nw === oldW) return phasePW;

  return { ...phasePW, [pid]: nw };
}

/**
 * Phase 벽 저항 (목업 wallAdj).
 * 누적 이동량이 WALL_FORCE 미만이면 경계 앞에서 튕겨 되돌린다.
 * 넘어간 경우 넘은 경계 x를 crossed로 알려 하이라이트에 쓴다.
 */
export function wallAdj(
  phases: WorkflowPhase[],
  phasePW: Record<string, number>,
  bx: number,
  bw: number,
  cx: number,
  accum: number,
): { x: number; crossed: number | null } {
  const { lanes } = laneG(phases, phasePW);
  const bnds = phases.slice(1).map((p) => lanes[p.id].x);
  for (const bnd of bnds) {
    if (cx < bnd && cx + bw > bnd) {
      if (Math.abs(accum) < WALL_FORCE) {
        return { x: bx + bw / 2 < bnd ? bnd - bw - GAP : bnd + GAP, crossed: null };
      }
      return { x: cx + bw / 2 < bnd ? bnd - bw - GAP : bnd + GAP, crossed: bnd };
    }
  }
  return { x: cx, crossed: null };
}

/**
 * 클릭한 블록 기준 flow 하이라이트 집합 (목업 connectedSet, 설계서 3.9).
 * prev 방향은 prev만, next 방향은 next만 계속 타고 간다 — 양방향을 섞지 않는다.
 */
export function connectedSet(id: string, edges: CanvasEdge[]): Set<string> {
  const seen = new Set([id]);
  let q = [id];
  while (q.length) {
    const c = q.shift()!;
    edges.forEach((e) => {
      if (e.to === c && !seen.has(e.from)) {
        seen.add(e.from);
        q.push(e.from);
      }
    });
  }
  q = [id];
  while (q.length) {
    const c = q.shift()!;
    edges.forEach((e) => {
      if (e.from === c && !seen.has(e.to)) {
        seen.add(e.to);
        q.push(e.to);
      }
    });
  }
  return seen;
}

/** 직교 라우팅 (목업 orth) — 곡선 없음 */
export function orth(a: Blk, b: Blk): string {
  const x1 = a.x + a.w;
  const y1 = Math.round(a.y + a.h / 2);
  const x2 = b.x;
  const y2 = Math.round(b.y + b.h / 2);
  if (x2 >= x1 + 24) {
    const mx = Math.round((x1 + x2) / 2);
    return y1 === y2 ? `M${x1},${y1}H${x2}` : `M${x1},${y1}H${mx}V${y2}H${x2}`;
  }
  const out = x1 + 22;
  const inn = x2 - 22;
  const low = Math.max(a.y + a.h, b.y + b.h) + 26;
  return `M${x1},${y1}H${out}V${low}H${inn}V${y2}H${x2}`;
}

/** 양방향 flow의 순환 아이콘 위치 (목업 drawEdges 내 cx2/cy2 계산) */
export function biIconPos(a: Blk, b: Blk) {
  const ax = a.x + a.w;
  const ay = Math.round(a.y + a.h / 2);
  const bx = b.x;
  const by = Math.round(b.y + b.h / 2);
  if (bx >= ax + 24) return { x: Math.round((ax + bx) / 2), y: Math.round((ay + by) / 2) };
  return { x: ax + 22, y: Math.max(a.y + a.h, b.y + b.h) + 26 };
}

/* ── 버전 헬퍼 (목업 latA/latR/hasW/vstr/stOf) ── */
export const vstr = (v: VersionView) => `v${v.major}.${v.minor}`;
export const latA = (d: CanvasNode) => d.versions[0] ?? null;
export const latR = (d: CanvasNode) => d.versions.find((v) => v.kind === 'major') ?? null;
export const hasW = (d: CanvasNode) => {
  const l = latA(d);
  return !!l && l.kind === 'minor';
};

export interface StatusStyle { lb: string; c: string; bg: string; bd: string }
export function stOf(d: CanvasNode): StatusStyle {
  if (!d.versions.length) return { lb: 'Not submitted', c: T.dm2, bg: T.sf2, bd: T.ln };
  if (hasW(d)) return { lb: 'In progress', c: T.am, bg: T.am2, bd: T.am3 };
  return { lb: 'Released', c: T.tl, bg: T.tl2, bd: T.tl3 };
}

/** "YYYY-MM-DD HH:mm" (목업 at 포맷) */
export function fmtAt(iso: string): string {
  if (!iso) return '';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
}
export function stamp(): string {
  return fmtAt(new Date().toISOString());
}

/**
 * 오늘 날짜의 캔버스 x 좌표.
 *
 * phase가 서로 겹치거나 사이가 비어 있을 수 있으므로(설계 변경) "오늘이 들어 있는
 * 단 하나의 phase"를 가정할 수 없다. 규칙:
 *   1) 오늘을 품는 phase가 있으면 그중 가장 왼쪽 레인 안에서 경과 비율만큼.
 *   2) 없으면(레인 사이 빈 구간) 앞뒤 레인 경계 사이를 날짜 비율로 보간한다.
 *   3) 전체 일정보다 이르면 0, 늦으면 전체 폭.
 */
export function todayX(phases: WorkflowPhase[], phasePW: Record<string, number>, now = new Date()): number | null {
  if (!phases.length) return null;
  const { lanes, total } = laneG(phases, phasePW);
  const t = now.getTime();
  const firstStart = Math.min(...phases.map((p) => dayMs(p.start)));
  const lastEnd = Math.max(...phases.map((p) => dayMs(p.end)));
  if (t <= firstStart) return 0;
  if (t >= lastEnd + DAY_MS) return total;

  for (const p of phases) {
    const st = dayMs(p.start);
    const en = dayMs(p.end) + DAY_MS;
    if (t >= st && t <= en) {
      const g = lanes[p.id];
      const r = (t - st) / Math.max(1, en - st);
      return Math.round(g.x + g.w * r);
    }
  }

  // 빈 구간: 바로 앞에서 끝난 레인의 오른쪽 끝 ~ 바로 뒤에 시작할 레인의 왼쪽 끝.
  let prev: { edge: number; ms: number } | null = null;
  let next: { edge: number; ms: number } | null = null;
  phases.forEach((p) => {
    const g = lanes[p.id];
    const en = dayMs(p.end) + DAY_MS;
    const st = dayMs(p.start);
    if (en <= t && (!prev || en > prev.ms)) prev = { edge: g.x + g.w, ms: en };
    if (st >= t && (!next || st < next.ms)) next = { edge: g.x, ms: st };
  });
  if (prev && next) {
    const a = prev as { edge: number; ms: number };
    const b = next as { edge: number; ms: number };
    const r = (t - a.ms) / Math.max(1, b.ms - a.ms);
    return Math.round(a.edge + (b.edge - a.edge) * r);
  }
  return prev ? (prev as { edge: number }).edge : 0;
}

