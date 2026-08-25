/**
 * Design Workflow view의 월드 좌표 레이아웃 — 과제 전체를 "아주 큰 한 판"으로 펼친다.
 *
 * 화면은 스크롤되지 않는다. 대신 IP 캔버스(components/canvas/Canvas.tsx)와 같은
 * 조작 모델(휠=줌, 드래그=시점 이동)로 이 월드를 돌아다닌다. 그래서 여기서 계산하는
 * 값은 전부 월드 좌표(px)이고, 카메라(translate+scale)가 그 위에 얹힌다.
 *
 * 구조:
 *   Domain = 우주에 떠 있는 거대한 판(island) 하나.
 *     └ 세로: IP 한 줄(row), 가로: Phase 한 칸(column).
 *       └ 각 칸에 그 IP가 그 Phase에 가진 산출물 블록이 쌓인다.
 *   같은 도메인 안의 IP↔IP 산출물 흐름은 라벨 열과 Phase 열 사이 거터에 곡선으로.
 *
 * DOM 측정은 하지 않는다 — 행 높이가 island마다 고정이라 전부 해석적으로 나온다.
 */
import { DeliverableDto, IpDto, PhaseRef } from '@/types/domain';
import { DomainFlow, DomainGroup, statusOf } from './domainWorkflow';

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

export interface FlowLayout {
  id: string;
  /** island 기준 상대 좌표의 SVG path. */
  d: string;
  color: string;
  width: number;
  title: string;
  /** 화살촉 끝점 + 방향(라디안). */
  tipX: number;
  tipY: number;
  tipAngle: number;
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
  flows: FlowLayout[];
  released: number;
  total: number;
  empty: boolean;
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
 * 산출물 수로 결정된다(도메인마다 다르되 island 안에서는 균일 — 거터 곡선을 해석적으로
 * 그릴 수 있게 하는 전제다).
 */
export function buildWorldLayout(
  domains: DomainGroup[],
  phases: PhaseRef[],
  deliverablesByIp: Map<string, DeliverableDto[]>,
  flowsByDomain: Map<string, DomainFlow[]>,
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

    /* 3) IP 행 + 블록. */
    const contentY = ISLAND_HEAD_H + PHASE_HEAD_H;
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
          blocks.push({
            id: d.id,
            name: d.name,
            docType: d.docType,
            status,
            x: cx + 12,
            y: rowY + ROW_PAD + k * (BLOCK_H + BLOCK_GAP),
            w: PHASE_W - 24,
            h: BLOCK_H,
          });
        });
      });

      // byPhase를 못 도는 산출물(존재하지 않는 phaseKey)도 total에는 세지 않았으므로
      // 화면 합계와 블록 수가 항상 일치한다.
      return { ip, y: rowY, h: rowH, blocks, released, total };
    });

    /* 4) 거터 곡선 — 같은 도메인 안의 IP→IP 흐름. */
    const rowIndex = new Map(domain.ips.map((ip, i) => [ip.id, i]));
    const ipById = new Map(domain.ips.map((ip) => [ip.id, ip]));
    const gutterX = ISLAND_PAD + LABEL_W;
    const flows: FlowLayout[] = (flowsByDomain.get(domain.key) ?? []).flatMap((f) => {
      const fromIdx = rowIndex.get(f.from);
      const toIdx = rowIndex.get(f.to);
      const fromIp = ipById.get(f.from);
      if (fromIdx === undefined || toIdx === undefined || !fromIp) return [];
      const y0 = contentY + fromIdx * rowH + rowH / 2;
      const y1 = contentY + toIdx * rowH + rowH / 2;
      const bulge = gutterX + Math.min(GUTTER_W - 10, 18 + Math.abs(toIdx - fromIdx) * 13);
      const x0 = gutterX + 4;
      // 종점 접선은 제어점 → 끝점 방향이라 곡선 끝에서 수평(-x)에 가깝다.
      return [{
        id: f.id,
        d: `M${x0},${y0} C${bulge},${y0} ${bulge},${y1} ${x0},${y1}`,
        color: fromIp.color || '#0c9a83',
        width: Math.min(4.5, 1.6 + f.total * 0.55),
        title: `${f.total} deliverable${f.total > 1 ? 's' : ''} (${f.released} released)\n${f.names.slice(0, 4).join(', ')}${f.names.length > 4 ? '…' : ''}`,
        tipX: x0,
        tipY: y1,
        tipAngle: Math.PI, // 왼쪽을 향해 꽂힌다
      }];
    });

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
      flows,
      released: domain.counts.released,
      total: domain.counts.total,
      empty: rows.length === 0,
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
