/**
 * 캔버스 작업 모델 + 순수 계산 로직.
 *
 * 배치·레인 폭·flow 라우팅 계산은 전부 여기(FE)에서 완결되고, BE는 결과 좌표만 저장한다.
 *
 * ★ 캔버스에는 **version 개념이 없다** — 모든 편집은 overwrite이고 스냅샷을 찍지 않는다
 *   (설계서 03장 §1). 그래서 예전의 스냅샷 변환기(toCanvasNodeFromSnapshot 등)와
 *   "받는 산출물"(incoming) 배치기가 전부 사라졌다.
 * ★ 블록에는 **버전 라벨을 쓰지 않는다.** 버전은 상세 slide에서만 보이고, 캔버스는
 *   publish 3상태 배지만 그린다(설계서 03장 §2).
 */
import { BlockDto, EdgeDto, MemoDto, PublishState, Tier, WorkflowPhase, isMaskedArtifact } from '@/types/domain';
import { DAY_MS, dayMs } from './schedule';
import {
  DEFAULT_PW, GAP, LANE_PAD, MH, MW, NH, NW, ROW_H, TOP_PAD, WALL_FORCE, snp,
} from './constants';
import { T, TIER_COLOR } from '@/theme/tokens';

/* ── 작업 모델 ── */

export interface CanvasNode {
  id: string;
  workflow: string;
  /**
   * 이 블록이 걸려 있는 phase의 id. workflow의 phase 목록에 없으면 "일정 유실" 상태다 —
   * 캔버스는 좌표를 그대로 두고 유실 표시만 붙인다(isOrphanPhase 참고).
   */
  phase: string;
  name: string;

  /** 매핑된 산출물. null이면 아직 출처를 정하지 않은 **정상 빈 상태**다. */
  artifactId: string | null;
  /** 열람 권한이 없으면 true — 버전·링크가 응답에 아예 담겨 오지 않는다. */
  artifactMasked: boolean;
  /** 미매핑이면 null. 마스킹된 경우에도 tier는 온다(존재 자체는 공개). */
  tier: Tier | null;
  net: 'OA' | 'HPC' | null;

  /** 캔버스가 그리는 유일한 상태 표시 — 버전 숫자는 쓰지 않는다. */
  publishState: PublishState;

  /**
   * A Tier에서만 값이 있다 — 같은 artifact라도 workflow마다 recipient가 다를 수 있어
   * block에 붙는다. B/C/D는 null이고 수신 부서는 artifact 쪽에서 온다.
   */
  recipientDepartments: string[];

  series: string | null;
  seriesIdx: number;
  seriesTotal: number;

  /* 좌표 */
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
  bi: boolean;
  auto: boolean;
}

export interface CanvasData {
  nodes: CanvasNode[];
  memos: CanvasMemo[];
  edges: CanvasEdge[];
  phaseWidths: Record<string, number>;
}

/** 캔버스 배치 계산에 필요한 최소 형태 — 노드와 메모가 함께 쓴다. */
export interface Blk {
  id: string;
  phase: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ── 서버 DTO → 작업 모델 ── */

export function toCanvasNode(b: BlockDto): CanvasNode {
  const artifact = b.artifact;
  const masked = isMaskedArtifact(artifact);
  return {
    id: b.id,
    workflow: b.workflowId,
    phase: b.phaseId,
    name: b.name,
    artifactId: b.artifactId,
    artifactMasked: masked,
    tier: artifact?.tier ?? null,
    net: artifact?.network ?? null,
    publishState: b.publishState,
    // A Tier는 block에, B/C/D는 artifact에 recipient가 있다 — 캔버스 필터는 둘을 합쳐 본다.
    recipientDepartments: b.recipients
      ? [
          ...new Set([
            ...b.recipients.editAccess.departments,
            ...b.recipients.viewAccess.departments,
          ]),
        ]
      : !masked && artifact && artifact.recipients
        ? [...artifact.recipients.departments]
        : [],
    series: b.series,
    seriesIdx: b.seriesIdx,
    seriesTotal: b.seriesTotal,
    x: b.layout.x,
    y: b.layout.y,
    w: b.layout.w || NW,
    h: b.layout.h || NH,
  };
}

export function toCanvasMemo(m: MemoDto): CanvasMemo {
  return {
    id: m._id,
    workflow: m.workflowId,
    phase: m.phaseId,
    text: m.text,
    x: m.layout.x,
    y: m.layout.y,
    w: m.layout.w || MW,
    h: m.layout.h || MH,
  };
}

export function toCanvasEdge(e: EdgeDto): CanvasEdge {
  return { id: e._id, from: e.fromId, to: e.toId, bi: e.bidirectional, auto: e.auto };
}

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
  return nodes.filter((n) => isOrphanPhase(phases, n.phase)).length;
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
 * Phase 폭 변경. phasePW를 갱신하고, 리사이즈하는 phase의 오른쪽 경계선 뒤에 있는
 * 모든 phase의 레인 x가 그 폭 변화량(dx)만큼 통째로 밀리므로, 그 phase들에 속한
 * 블록도 같은 dx만큼 같이 옮겨 제 레인 안의 상대 위치를 그대로 유지한다.
 *
 * 늘릴 때뿐 아니라 줄일 때도 반드시 옮겨야 한다 — 줄여도 뒤 phase들의 레인은
 * 왼쪽으로 그만큼 밀리는데, 블록만 제자리에 남으면 그 블록이 이제 자기 레인
 * 바깥(옆 phase 쪽)에 걸치게 되어 resolveNodePhases가 엉뚱한 phase로 재배정해
 * 버린다(사용자가 겪은 "phase가 바뀌는" 역효과 — 늘릴 때만 막아서는 줄일 때
 * 그대로 재현된다). 리사이즈 중인 phase 자신과 그 이전 phase들의 블록은 늘리든
 * 줄이든 절대 움직이지 않는다 — 그 블록들의 레인 x 자체가 안 변하기 때문이다.
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

  const dx = nw - oldW;
  const laterPhaseIds = new Set(phases.slice(idx + 1).map((p) => p.id));
  blocks.forEach((b) => {
    if (laterPhaseIds.has(b.phase)) b.x = snp(b.x + dx);
  });

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

/* ── 표시 헬퍼 ── */

/**
 * publish 3상태의 시각 표현 (설계서 03장 §2.2).
 *
 * ★ 숫자(버전 라벨)는 쓰지 않는다 — 버전은 상세 slide에서만 보인다.
 * ★ 'newlyPublished'는 "마지막 release 이후 major가 올라갔다" = **다음 release에서
 *   highlight될 대상**이라는 뜻이다. 캔버스에서 미리 눈에 띄어야 한다.
 */
export interface StatusStyle { lb: string; c: string; bg: string; bd: string }

export function stOf(n: CanvasNode): StatusStyle {
  // 열람 권한이 없으면 상태 자체가 정보이므로 배지를 그리지 않는다.
  if (n.artifactMasked) return { lb: 'No access', c: T.dm2, bg: T.sf2, bd: T.ln };
  if (!n.artifactId) return { lb: 'No source', c: T.dm2, bg: T.sf2, bd: T.ln };
  switch (n.publishState) {
    case 'newlyPublished':
      return { lb: 'New', c: T.pr, bg: T.prSoft, bd: T.prLine };
    case 'published':
      return { lb: 'Published', c: T.ok, bg: T.okSoft, bd: T.okLine };
    default:
      return { lb: 'Not published', c: T.dm2, bg: T.sf2, bd: T.ln };
  }
}

/** 블록의 tier 배지 색 — 미매핑/마스킹이면 중립색으로 둔다. */
export function tierStyle(n: CanvasNode): { fg: string; bg: string } {
  if (!n.tier) return { fg: T.dm2, bg: T.sf3 };
  return TIER_COLOR[n.tier];
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

