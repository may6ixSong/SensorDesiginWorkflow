/**
 * 캔버스 작업 모델 + 순수 계산 로직.
 * 목업(analog-dashboard-v15.html)의 laneG/phaseAtX/reflowLane/resolve/wallAdj/
 * autoFit/connectedSet/orth/stOf/todayX 를 1:1로 이식한 것이다.
 *
 * 설계서 1.3·5.5에 따라 이 계산은 전부 FE에서 완결되고, BE는 결과 좌표만 저장한다.
 */
import { DeliverableDto, EdgeDto, MemoDto, PhaseRef } from '@/types/domain';
import {
  DEFAULT_PW, GAP, LANE_PAD, MH, MW, NH, NW, PAD, ROW_H, TOP_PAD, WALL_FORCE, snp,
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
  ip: string;
  phase: string;
  name: string;
  type: string;
  net: 'OA' | 'HPC';
  series: string | null;
  seriesIdx: number;
  seriesTotal: number;
  recvDept: string | null;
  recvContact: string | null;
  versions: VersionView[];
  canEdit: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CanvasMemo {
  id: string;
  ip: string;
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
export function toCanvasNode(d: DeliverableDto): CanvasNode {
  return {
    id: d.id,
    ip: d.ipId,
    phase: d.phaseKey,
    name: d.name,
    type: d.docType,
    net: d.network,
    series: d.series,
    seriesIdx: d.seriesIdx,
    seriesTotal: d.seriesTotal,
    recvDept: d.recvDept,
    recvContact: d.recvContact,
    versions: d.versions ?? [],
    canEdit: d.canEdit,
    x: d.layout?.x ?? 0,
    y: d.layout?.y ?? 0,
    w: d.layout?.w || NW,
    h: d.layout?.h || NH,
  };
}
export function toCanvasMemo(m: MemoDto): CanvasMemo {
  return {
    id: m._id,
    ip: m.ipId,
    phase: m.phaseKey,
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
export function laneG(phases: PhaseRef[], phasePW: Record<string, number>) {
  let x = 0;
  const o: Record<string, { x: number; w: number }> = {};
  phases.forEach((p) => {
    const w = getPW(phasePW, p.key);
    o[p.key] = { x, w };
    x += w;
  });
  return { lanes: o, total: x };
}

/** x 좌표가 속한 Phase id (목업 phaseAtX) */
export function phaseAtX(phases: PhaseRef[], phasePW: Record<string, number>, cx: number): string {
  const { lanes } = laneG(phases, phasePW);
  for (const p of phases) {
    const g = lanes[p.key];
    if (cx >= g.x && cx < g.x + g.w) return p.key;
  }
  return cx < 0 ? phases[0].key : phases[phases.length - 1].key;
}

type Blk = { id: string; phase: string; x: number; y: number; w: number; h: number };

/** 레인 밖으로 삐져나간 블록이 있는지 (목업 laneOverflow) */
export function laneOverflow(blocks: Blk[], phases: PhaseRef[], phasePW: Record<string, number>, pid: string) {
  const g = laneG(phases, phasePW).lanes[pid];
  if (!g) return false;
  return blocks
    .filter((b) => b.phase === pid)
    .some((b) => b.x < g.x + LANE_PAD || b.x + b.w > g.x + g.w - LANE_PAD);
}

/** 레인 안에서 좌→우 배치, 폭이 모자라면 아래 줄로 개행 (목업 reflowLane) */
export function reflowLane(blocks: Blk[], phases: PhaseRef[], phasePW: Record<string, number>, pid: string) {
  const g = laneG(phases, phasePW).lanes[pid];
  if (!g) return;
  const lx = g.x + LANE_PAD;
  const lw = g.w - LANE_PAD * 2;
  const bs = blocks.filter((b) => b.phase === pid);
  if (!bs.length) return;
  bs.sort((a, b) => (Math.abs(a.y - b.y) > ROW_H / 2 ? a.y - b.y : a.x - b.x));
  let cx = lx;
  let cy = TOP_PAD;
  let rowH = 0;
  bs.forEach((b) => {
    if (cx > lx && cx + b.w > lx + lw) {
      cx = lx;
      cy += rowH + GAP;
      rowH = 0;
    }
    b.x = snp(cx);
    b.y = snp(cy);
    cx += b.w + GAP;
    rowH = Math.max(rowH, b.h);
  });
}

/** Phase 최소 폭 (목업 minPW) */
export function minPW(blocks: Blk[], pid: string) {
  const maxW = blocks.filter((b) => b.phase === pid).reduce((m, b) => Math.max(m, b.w || NW), NW);
  return Math.max(maxW + LANE_PAD * 2 + GAP, 240);
}

/**
 * Phase 폭 변경 (목업 resizePhase의 좌표 재계산 부분).
 * blocks를 in-place로 옮기고, 새 phasePW를 반환한다.
 */
export function resizePhase(
  blocks: Blk[],
  phases: PhaseRef[],
  phasePW: Record<string, number>,
  pid: string,
  rawNewW: number,
): Record<string, number> {
  const idx = phases.findIndex((p) => p.key === pid);
  if (idx < 0) return phasePW;

  const nw = Math.max(minPW(blocks, pid), Math.round(rawNewW));
  const oldW = getPW(phasePW, pid);
  if (nw === oldW) return phasePW;

  const oldMap = { ...phasePW, [pid]: oldW };
  const newMap = { ...phasePW, [pid]: nw };
  const Gold = laneG(phases, oldMap).lanes;
  const Gnew = laneG(phases, newMap).lanes;

  phases.forEach((p, i) => {
    if (i < idx) return;
    const dx = (Gnew[p.key]?.x ?? 0) - (Gold[p.key]?.x ?? 0);
    if (dx === 0) return;
    blocks.filter((b) => b.phase === p.key).forEach((b) => {
      b.x = snp(Math.max(PAD, b.x + dx));
    });
  });

  if (laneOverflow(blocks, phases, newMap, pid)) reflowLane(blocks, phases, newMap, pid);

  // 전체 충돌 해소 패스 (목업과 동일하게 8회 반복, 겹치면 아래로)
  for (let iter = 0; iter < 8; iter++) {
    blocks.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));
    let moved = false;
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const A = blocks[i];
        const B = blocks[j];
        if (A.x < B.x + B.w + GAP && A.x + A.w + GAP > B.x && A.y < B.y + B.h + GAP && A.y + A.h + GAP > B.y) {
          B.y = snp(A.y + A.h + GAP);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return newMap;
}

/**
 * Phase 벽 저항 (목업 wallAdj).
 * 누적 이동량이 WALL_FORCE 미만이면 경계 앞에서 튕겨 되돌린다.
 * 넘어간 경우 넘은 경계 x를 crossed로 알려 하이라이트에 쓴다.
 */
export function wallAdj(
  phases: PhaseRef[],
  phasePW: Record<string, number>,
  bx: number,
  bw: number,
  cx: number,
  accum: number,
): { x: number; crossed: number | null } {
  const { lanes } = laneG(phases, phasePW);
  const bnds = phases.slice(1).map((p) => lanes[p.key].x);
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

/** 오늘 날짜의 캔버스 x 좌표 (목업 todayX) */
export function todayX(phases: PhaseRef[], phasePW: Record<string, number>, now = new Date()): number | null {
  if (!phases.length) return null;
  const { lanes, total } = laneG(phases, phasePW);
  const first = new Date(phases[0].start);
  const last = new Date(phases[phases.length - 1].end);
  if (now < first) return 0;
  if (now > last) return total;
  for (const p of phases) {
    const st = new Date(p.start);
    const en = new Date(p.end);
    if (now >= st && now <= en) {
      const g = lanes[p.key];
      const r = (now.getTime() - st.getTime()) / Math.max(1, en.getTime() - st.getTime());
      return Math.round(g.x + g.w * r);
    }
  }
  return null;
}

/**
 * Auto Fit — 지그재그 토폴로지 배치 (목업 autoFit, 설계서 3.8).
 * blocks/phasePW를 새로 계산해 반환한다.
 */
export function autoFit(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  phases: PhaseRef[],
): { positions: Record<string, { x: number; y: number }>; phasePW: Record<string, number> } {
  const allIds = nodes.map((d) => d.id);
  const visSet = new Set(allIds);

  const inDeg: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  allIds.forEach((id) => {
    inDeg[id] = 0;
    adj[id] = [];
  });
  edges.filter((e) => visSet.has(e.from) && visSet.has(e.to)).forEach((e) => {
    if (!adj[e.from].includes(e.to)) adj[e.from].push(e.to);
    inDeg[e.to] = (inDeg[e.to] || 0) + 1;
  });

  const queue = allIds.filter((id) => (inDeg[id] || 0) === 0);
  const order: string[] = [];
  const vis = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (vis.has(id)) continue;
    vis.add(id);
    order.push(id);
    adj[id].forEach((n) => {
      inDeg[n]--;
      if (inDeg[n] <= 0 && !vis.has(n)) queue.push(n);
    });
  }
  allIds.forEach((id) => {
    if (!vis.has(id)) order.push(id);
  });

  const depth: Record<string, number> = {};
  order.forEach((id) => {
    let d = 0;
    allIds.forEach((src) => {
      if (adj[src] && adj[src].includes(id)) d = Math.max(d, (depth[src] ?? -1) + 1);
    });
    depth[id] = d;
  });

  const ZDXR = Math.round(NW * 0.55);
  const ZDY = Math.round(NH * 0.7);

  const nextPW: Record<string, number> = {};
  phases.forEach((p) => {
    const days = Math.max(1, Math.round((+new Date(p.end) - +new Date(p.start)) / 864e5));
    const cols = days >= 56 ? 3 : days >= 28 ? 2 : 1;
    nextPW[p.key] = Math.max(DEFAULT_PW, LANE_PAD * 2 + cols * NW + (cols - 1) * GAP + ZDXR);
  });
  const { lanes } = laneG(phases, nextPW);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const placed: Record<string, { x: number; y: number }> = {};

  phases.forEach((p) => {
    const g = lanes[p.key];
    if (!g) return;
    const pbs = order.filter((id) => byId.get(id)?.phase === p.key);
    if (!pbs.length) return;
    const minD = Math.min(...pbs.map((id) => depth[id] ?? 0));
    const byD: Record<number, string[]> = {};
    pbs.forEach((id) => {
      const d = depth[id] ?? 0;
      (byD[d] || (byD[d] = [])).push(id);
    });
    let rowY = TOP_PAD;
    Object.keys(byD)
      .map(Number)
      .sort((a, b) => a - b)
      .forEach((d) => {
        const row = byD[d];
        const isOdd = (d - minD) % 2 === 1;
        let cx = g.x + LANE_PAD + (isOdd ? ZDXR : 0);
        let maxH = 0;
        row.forEach((id) => {
          const bk = byId.get(id);
          if (!bk) return;
          if (cx + bk.w > g.x + g.w - LANE_PAD) {
            cx = g.x + LANE_PAD + (isOdd ? ZDXR : 0);
            rowY += maxH + GAP;
            maxH = 0;
          }
          placed[id] = { x: snp(cx), y: snp(rowY) };
          cx += bk.w + GAP;
          maxH = Math.max(maxH, bk.h);
        });
        rowY += maxH + ZDY;
      });
  });

  // AutoFit 내 겹침 방지 — 같은 Phase 내만 (설계서 3.8-5)
  for (let it = 0; it < 8; it++) {
    let mv = false;
    for (let i = 0; i < nodes.length; i++) {
      const A = nodes[i];
      const pa = placed[A.id] ?? { x: A.x, y: A.y };
      for (let j = i + 1; j < nodes.length; j++) {
        const B = nodes[j];
        if (A.phase !== B.phase) continue;
        const pb = placed[B.id] ?? { x: B.x, y: B.y };
        if (pa.x < pb.x + B.w + GAP && pa.x + A.w + GAP > pb.x && pa.y < pb.y + B.h + GAP && pa.y + A.h + GAP > pb.y) {
          placed[B.id] = { x: pb.x, y: snp(pa.y + A.h + GAP) };
          mv = true;
        }
      }
    }
    if (!mv) break;
  }

  return { positions: placed, phasePW: nextPW };
}
