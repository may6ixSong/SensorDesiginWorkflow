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
export const BLOCK_GAP = 11;
export const ROW_PAD = 12;
export const MIN_ROW_H = 88;
/** island 사이 여백 — 넉넉해야 "판과 판 사이 빈 우주"를 지나가는 느낌이 난다. */
export const ISLAND_GAP = 300;
/** island를 좌우로 살짝 엇갈리게 두어 표 같지 않고 떠 있는 느낌을 준다. */
const STAGGER = 84;
/** 산출물 배치를 흩뜨리는 범위(px). 세로(JITTER_Y)는 좁게 잡아야 한다 — 라벨이
 * 옆으로 길게 뜨는 구조라, 세로로 너무 흔들면 위·아래 산출물 이름끼리 겹친다.
 * 가로(JITTER_X)는 그 제약이 없어 훨씬 크게 흩어도 안전하다. */
const JITTER_X = 30;
const JITTER_Y = 4;
/** 크기(depth)가 큰(=가까운) 산출물일수록 칸 안에서 살짝 아래로, 작은(=먼)
 * 산출물은 살짝 위로 — 원근감을 "노이즈"가 아니라 일관된 규칙으로 준다. */
const DEPTH_TILT = 6;
/** IP 행이 phase를 가로지르며 오르내리는 물결의 진폭(px) — 행이 자로 잰 듯
 * 수평이면 결국 표로 읽힌다. 행 경계(rowY/rowH)나 라벨 위치는 그대로 두고
 * 그 안의 산출물 배치에만 쓴다. */
const ROW_WAVE = 13;

/** FNV-1a 32bit 해시 — 항상 같은 입력에 같은 값(새로고침해도 배치가 그대로). */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/** [0,1) 결정적 의사난수. */
function rand01(seed: string): number {
  return hash32(seed) / 4294967296;
}

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
  /** 순수 시각적 크기 배율(0.85~1.15) — 크게/작게 섞어서 "가까이/멀리" 있는
   * 것처럼 입체감을 준다. 레이아웃 계산(행 높이 등)에는 관여하지 않는, 그리는
   * 단계에서만 쓰는 값. */
  depth: number;
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

/** 같은 IP 안의 산출물 두 개를 잇는 아주 얇은 선 — island 기준 상대 좌표.
 * 직선이 아니라 완만한 S자 곡선(적분 기호 느낌)이라, 같은 칸에 세로로 쌓인
 * 산출물들 사이를 이어도 그 사이에 낀 다른 산출물을 뚫고 지나가지 않고 옆으로
 * 비켜 간다 — path는 미리 계산해 둔 SVG path data("d" 속성)다. */
export interface WireLink {
  id: string;
  fromId: string;
  toId: string;
  path: string;
}

/** 두 점을 잇는 완만한 S자 베지어 — 직선이면 중간에 낀 다른 산출물을 그대로
 * 관통해 버린다(특히 같은 phase 칸에 세로로 쌓인 경우). 진행 방향에 수직으로
 * 살짝 배부르게 휘어 옆으로 비켜 가게 하고, 어느 쪽으로 휠지는 id 해시로
 * 정해 매번 같은 모양이 나오되 와이어마다 자연스럽게 갈리게 한다. */
function wirePath(id: string, x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const px = -dy / dist;
  const py = dx / dist;
  const bend = Math.min(64, Math.max(18, dist * 0.24));
  const sign = rand01(`${id}:bend`) < 0.5 ? 1 : -1;
  const c1x = x1 + dx * 0.33 + px * bend * sign;
  const c1y = y1 + dy * 0.33 + py * bend * sign;
  const c2x = x1 + dx * 0.67 - px * bend * sign;
  const c2y = y1 + dy * 0.67 - py * bend * sign;
  return `M ${x1} ${y1} C ${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`;
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
    const colIndexOf = new Map(cols.map((c, i) => [c.phase.key, i]));

    /* 3) IP 행 + 블록. 동시에 산출물 id → 중심 좌표 맵을 쌓아 4)에서 와이어를 잇는다. */
    const contentY = ISLAND_HEAD_H + PHASE_HEAD_H;
    const centerOf = new Map<string, { x: number; y: number }>();
    const rows: IpRowLayout[] = perIp.map(({ ip, byPhase }, ri) => {
      const rowY = contentY + ri * rowH;
      // 행이 phase를 가로지르며 오르내리게 — 칸마다 고정된 오프셋이 아니라
      // sin 곡선을 태워서, 같은 행 안에서도 phase가 바뀔 때마다 자연스럽게
      // 흐른다. rowY/rowH(행 경계)는 그대로 두고 그 안의 산출물 배치에만
      // 적용하는 순수 렌더링 오프셋이라 라벨/음영 계산은 안 바뀐다. 위상
      // (rowPhase)을 행마다 다르게 둬서 모든 행이 같은 박자로 출렁이지 않게 한다.
      const rowPhase = rand01(`row:${ip.id}`) * Math.PI * 2;
      const blocks: BlockNode[] = [];
      let released = 0;
      let total = 0;

      byPhase.forEach((items, phaseKey) => {
        const cx = colX.get(phaseKey);
        if (cx === undefined) return; // 과제 Phase 목록에 없는 값이면 그리지 않는다
        const n = items.length;
        const ci = colIndexOf.get(phaseKey) ?? 0;
        const colWave = Math.sin(ci * 1.35 + rowPhase) * ROW_WAVE;
        items.forEach((d, k) => {
          const status = statusOf(d);
          if (status === 'released') released++;
          total++;
          // depth는 순수 시각 크기(구체 반지름)다 — 크게(가까이)/작게(멀리) 섞어
          // 원근감을 준다. 화면에 실제로 뜨는 구체 중심에 와이어 끝을 정확히
          // 물리려면 배치 계산에도 이 반지름이 필요하다.
          const depth = 0.85 + rand01(`${d.id}:depth`) * 0.3;
          const depthNorm = (depth - 0.85) / 0.3;
          // 세로는 원래의 한 줄 쌓기(k번째 칸)를 그대로 쓴다 — 라벨이 옆으로
          // 길게 뜨기 때문에 세로 순서가 흔들리면 이름끼리 겹친다. 대신 그 안에서
          // "가까운 건 살짝 아래로, 먼 건 살짝 위로" + 행 물결 + 아주 약한 지터로
          // 자로 잰 격자처럼 보이지 않게 한다. 가로는 이 제약이 없어 크게 흩는다.
          const bandY = rowY + ROW_PAD + k * (BLOCK_H + BLOCK_GAP);
          const x = cx + 12 + (rand01(`${d.id}:x`) - 0.5) * 2 * JITTER_X;
          const y = n <= 1
            ? rowY + ROW_PAD + (rowH - ROW_PAD * 2 - BLOCK_H) / 2 + colWave
            : bandY + colWave + (0.5 - depthNorm) * DEPTH_TILT + (rand01(`${d.id}:y`) - 0.5) * 2 * JITTER_Y;
          // 오른쪽으로 흩어진 블록이라도 라벨이 다음 phase 경계를 넘어가지 않게,
          // 남은 폭만큼만 박스를 준다(라벨은 어차피 overflow:ellipsis로 잘린다).
          const w = Math.max(90, cx + PHASE_W - 12 - x);
          const h = BLOCK_H;
          blocks.push({ id: d.id, name: d.name, docType: d.docType, status, x, y, w, h, depth });
          const r = Math.min(h, 46) * depth * 0.5;
          centerOf.set(d.id, { x: x + r, y: y + h / 2 });
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
        return [{ id: e._id, fromId: e.fromId, toId: e.toId, path: wirePath(e._id, a.x, a.y, b.x, b.y) }];
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
