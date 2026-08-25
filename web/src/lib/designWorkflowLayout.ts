/**
 * Design Workflow view의 월드 좌표 레이아웃 — 과제 전체를 "아주 큰 한 판"으로 펼친다.
 *
 * 화면은 스크롤되지 않는다. 대신 IP 캔버스(components/canvas/Canvas.tsx)와 같은
 * 조작 모델(휠=줌, 드래그=시점 이동)로 이 월드를 돌아다닌다. 그래서 여기서 계산하는
 * 값은 전부 월드 좌표(px)이고, 카메라(translate+scale)가 그 위에 얹힌다.
 *
 * 구조:
 *   Domain = 우주의 한 구역 하나.
 *     └ 세로: IP 한 줄(row), 가로: Phase 한 칸(column).
 *       └ 각 칸에 그 IP가 그 Phase에 가진 산출물 블록이 쌓인다.
 *   와이어(wire) = 같은 IP 안에서 산출물끼리 연결된 flow(EdgeDto, fromId/toId가
 *   모두 그 IP의 산출물) — IP를 벗어나는 연결(recvIpId로 다른 IP에 주는 것)은
 *   여기서 다루지 않는다(요청). 산출물을 주고/받는 두 IP 입장에서는 "같은 산출물"
 *   하나일 뿐이라 굳이 두 IP 사이를 잇는 별도 표현이 필요 없다는 판단.
 *
 * DOM 측정은 하지 않는다 — 행 높이가 island마다 고정이라 전부 해석적으로 나온다.
 */
import { DeliverableDto, EdgeDto, IpDto, PhaseRef } from '@/types/domain';
import { DomainGroup, statusOf } from './domainWorkflow';

/* ── 월드 좌표 상수 ── */
export const LABEL_W = 236;
export const GUTTER_W = 64;
export const PHASE_W = 208;
export const PHASE_HEAD_H = 62;
export const ISLAND_HEAD_H = 104;
export const ISLAND_PAD = 26;
export const BLOCK_H = 48;
export const BLOCK_GAP = 9;
export const ROW_PAD = 12;
export const MIN_ROW_H = 76;
/** island 사이 여백 — 넉넉해야 "판과 판 사이 빈 우주"를 지나가는 느낌이 난다. */
export const ISLAND_GAP = 300;
/** island를 좌우로 살짝 엇갈리게 두어 표 같지 않고 떠 있는 느낌을 준다. */
const STAGGER = 84;

export type BlockStatus = 'released' | 'inProgress' | 'notSubmitted';

export interface BlockNode {
  id: string;
  name: string;
  docType: string;
  status: BlockStatus;
  /** island 기준 상대 좌표. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IpRowLayout {
  ip: IpDto;
  /** island 기준 상대 y (행 상단). */
  y: number;
  h: number;
  blocks: BlockNode[];
  released: number;
  total: number;
}

export interface PhaseColLayout {
  phase: PhaseRef;
  /** island 기준 상대 x. */
  x: number;
  w: number;
  state: 'past' | 'current' | 'upcoming';
}

/** 같은 IP 안의 산출물 두 개를 잇는 아주 얇은 선 — island 기준 상대 좌표. */
export interface WireLink {
  id: string;
  fromId: string;
  toId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface IslandLayout {
  key: string;
  label: string;
  color: string;
  /** 월드 절대 좌표. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** island 기준 — 행 영역이 시작하는 y. */
  contentY: number;
  rowH: number;
  cols: PhaseColLayout[];
  rows: IpRowLayout[];
  wires: WireLink[];
  released: number;
  total: number;
}

export interface WorldLayout {
  islands: IslandLayout[];
  bounds: { x: number; y: number; w: number; h: number };
}

function phaseState(p: PhaseRef, now: number): PhaseColLayout['state'] {
  const st = new Date(p.start).getTime();
  const en = new Date(p.end).getTime();
  return now < st ? 'upcoming' : now > en ? 'past' : 'current';
}

/**
 * 도메인 그룹 + Phase + 산출물로 월드 전체 배치를 만든다.
 * island는 세로로 쌓이고, 각 island의 행 높이는 그 island에서 한 칸에 가장 많이 쌓인
 * 산출물 수로 결정된다(도메인마다 다르되 island 안에서는 균일).
 *
 * @param edgesByIp ipId → 그 IP 안의 산출물↔산출물 flow(EdgeDto). fromId/toId는
 *   항상 같은 IP의 산출물이므로 island 하나 안에서 좌표를 바로 찾을 수 있다.
 */
export function buildWorldLayout(
  domains: DomainGroup[],
  phases: PhaseRef[],
  deliverablesByIp: Map<string, DeliverableDto[]>,
  edgesByIp: Map<string, EdgeDto[]>,
  now = Date.now(),
): WorldLayout {
  const gridW = LABEL_W + GUTTER_W + phases.length * PHASE_W;
  const islandW = gridW + ISLAND_PAD * 2;

  const islands: IslandLayout[] = [];
  let cursorY = 0;

  domains.forEach((domain, di) => {
    /* 1) 이 island의 칸별 산출물을 모으고 최대 적재량으로 행 높이를 정한다. */
    const perIp = domain.ips.map((ip) => {
      const byPhase = new Map<string, DeliverableDto[]>();
      (deliverablesByIp.get(ip.id) ?? []).forEach((d) => {
        const arr = byPhase.get(d.phaseKey) ?? [];
        arr.push(d);
        byPhase.set(d.phaseKey, arr);
      });
      return { ip, byPhase };
    });

    let maxStack = 0;
    perIp.forEach(({ byPhase }) => byPhase.forEach((arr) => { maxStack = Math.max(maxStack, arr.length); }));
    const stack = Math.max(1, maxStack);
    const rowH = Math.max(MIN_ROW_H, ROW_PAD * 2 + stack * BLOCK_H + (stack - 1) * BLOCK_GAP);

    /* 2) Phase 열. */
    const cols: PhaseColLayout[] = phases.map((p, i) => ({
      phase: p,
      x: ISLAND_PAD + LABEL_W + GUTTER_W + i * PHASE_W,
      w: PHASE_W,
      state: phaseState(p, now),
    }));
    const colX = new Map(cols.map((c) => [c.phase.key, c.x]));

    /* 3) IP 행 + 블록. 동시에 산출물 id → 중심 좌표 맵을 쌓아 4)에서 와이어를 잇는다. */
    const contentY = ISLAND_HEAD_H + PHASE_HEAD_H;
    const centerOf = new Map<string, { x: number; y: number }>();
    const rows: IpRowLayout[] = perIp.map(({ ip, byPhase }, ri) => {
      const rowY = contentY + ri * rowH;
      const blocks: BlockNode[] = [];
      let released = 0;
      let total = 0;

      byPhase.forEach((items, phaseKey) => {
        const cx = colX.get(phaseKey);
        if (cx === undefined) return; // 과제 Phase 목록에 없는 값이면 그리지 않는다
        items.forEach((d, k) => {
          const status = statusOf(d);
          if (status === 'released') released++;
          total++;
          const x = cx + 12;
          const y = rowY + ROW_PAD + k * (BLOCK_H + BLOCK_GAP);
          const w = PHASE_W - 24;
          const h = BLOCK_H;
          blocks.push({ id: d.id, name: d.name, docType: d.docType, status, x, y, w, h });
          centerOf.set(d.id, { x: x + w / 2, y: y + h / 2 });
        });
      });

      return { ip, y: rowY, h: rowH, blocks, released, total };
    });

    /* 4) 와이어 — 같은 IP 안의 산출물↔산출물 flow만. IP를 벗어나는 연결은 만들지
       않는다: recvIpId로 다른 IP에 주는 산출물도 "같은 문서"일 뿐이라 두 IP 사이에
       별도 선을 그릴 필요가 없다는 게 이 화면의 전제다. */
    const wires: WireLink[] = domain.ips.flatMap((ip) => (
      (edgesByIp.get(ip.id) ?? []).flatMap((e) => {
        const a = centerOf.get(e.fromId);
        const b = centerOf.get(e.toId);
        if (!a || !b) return [];
        return [{ id: e._id, fromId: e.fromId, toId: e.toId, x1: a.x, y1: a.y, x2: b.x, y2: b.y }];
      })
    ));

    const bodyH = Math.max(rowH, rows.length * rowH);
    const islandH = contentY + (rows.length ? bodyH : 120) + ISLAND_PAD;
    const x = (di % 2 === 0 ? -STAGGER : STAGGER);

    islands.push({
      key: domain.key,
      label: domain.label,
      color: domain.color,
      x,
      y: cursorY,
      w: islandW,
      h: islandH,
      contentY,
      rowH,
      cols,
      rows,
      wires,
      released: domain.counts.released,
      total: domain.counts.total,
    });

    cursorY += islandH + ISLAND_GAP;
  });

  const minX = islands.length ? Math.min(...islands.map((i) => i.x)) : 0;
  const maxX = islands.length ? Math.max(...islands.map((i) => i.x + i.w)) : islandW;
  const maxY = islands.length ? Math.max(...islands.map((i) => i.y + i.h)) : 400;

  return {
    islands,
    bounds: { x: minX, y: 0, w: maxX - minX, h: maxY },
  };
}

/**
 * 클릭한 산출물 기준 flow 연결 집합 — IP 캔버스의 connectedSet(canvasModel.ts)과
 * 같은 규칙(양방향 BFS)이다. EdgeDto가 fromId/toId를 쓰는 것만 다르다.
 */
export function connectedDeliverables(id: string, edges: EdgeDto[]): Set<string> {
  const seen = new Set([id]);
  let q = [id];
  while (q.length) {
    const c = q.shift()!;
    edges.forEach((e) => {
      if (e.toId === c && !seen.has(e.fromId)) { seen.add(e.fromId); q.push(e.fromId); }
    });
  }
  q = [id];
  while (q.length) {
    const c = q.shift()!;
    edges.forEach((e) => {
      if (e.fromId === c && !seen.has(e.toId)) { seen.add(e.toId); q.push(e.toId); }
    });
  }
  return seen;
}
