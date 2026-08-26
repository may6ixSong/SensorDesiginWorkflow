/**
 * Design Workflow view의 월드 좌표 레이아웃 — 과제 전체를 하나의 3D 우주로 펼친다.
 *
 * 축의 의미가 고정돼 있다(사용자 요청):
 *   x = 시간. 과제 전체 기간(마일스톤 ∪ 모든 workflow phase)을 하나의 날짜축으로 깔고,
 *       산출물은 자기 phase의 **종료일** 위치에 놓인다. 그래서 도메인이 달라도, workflow마다
 *       일정이 달라도 x가 서로 어긋나지 않는다 — 같은 날짜면 같은 x다.
 *   y = workflow. 한 workflow가 한 줄이고, 도메인끼리는 큰 간격으로 떨어진다.
 *   z = 자유. 깊이는 결정적 해시로 흩뿌린다 — 표가 아니라 "행성이 떠 있는 공간"으로
 *       보이게 하는 유일한 축이며, 어떤 데이터도 의미하지 않는다.
 *
 * 과제 마일스톤은 이 x축 위의 세로 구간(밴드)으로만 그린다 — 도메인/workflow와 무관하게
 * 화면 전체를 가로지르는 배경이다.
 *
 * 화면은 스크롤되지 않는다. workflow 캔버스와 같은 조작 모델(휠=줌, 드래그=시점 이동)로
 * 이 월드를 돌아다니고, 카메라(translate+scale)가 그 위에 얹힌다. z는 CSS perspective가
 * 처리하므로 여기서는 월드 좌표만 계산한다.
 *
 * DOM 측정은 하지 않는다 — 전부 해석적으로 나온다.
 */
import { DeliverableDto, EdgeDto, Milestone, WorkflowDto } from '@/types/domain';
import { DAY_MS, DateRange, dayMs, rangeOf, ratioIn } from './schedule';
import { DomainGroup, statusOf } from './domainWorkflow';

/* ── 월드 좌표 상수 ── */
/** 하루당 가로 픽셀 — 1년이면 대략 1100px. */
export const PX_PER_DAY = 3;
export const MIN_AXIS_W = 1200;
/** workflow 이름 라벨이 차지하는 왼쪽 칸. */
export const LABEL_W = 250;
/** 라벨과 날짜축 사이의 "일정 없음" 구역 폭 — 유실된 산출물이 여기에 모인다. */
export const UNSCHEDULED_W = 190;
/** 축 오른쪽 여백. */
export const TAIL_W = 140;
/** workflow 한 줄의 높이. 산출물 이름표가 옆으로 길게 뜨므로 넉넉해야 읽힌다. */
export const ROW_H = 172;
/** 도메인 그룹 사이 여백 — 넉넉해야 "구역이 갈린다"는 느낌이 난다. */
export const DOMAIN_GAP = 230;
/** 도메인 헤더(이름 + 문턱선)가 차지하는 높이. */
export const DOMAIN_HEAD_H = 84;
/** 산출물 구체의 기본 지름. */
export const BLOCK_D = 34;
/** z(깊이) 진폭 — ±이 값 안에서 흩어진다. 순수하게 보기 위한 축이다. */
export const Z_SPREAD = 260;
/** 같은 행에서 x가 가까운 것들을 세로로 벌리는 간격. */
const STACK_Y = 40;
/**
 * 같은 행 안에서 "가깝다"고 볼 x 폭. 산출물은 구체 + 옆으로 뻗는 이름표라 가로
 * 점유폭이 넓다 — 이 값이 좁으면 x가 조금만 달라도 같은 높이에 놓여 이름표가 서로
 * 겹친다. 이름표 최대 폭(BLOCK_LABEL_W)과 맞춰 둔다.
 */
const BUCKET_W = 190;
/** 산출물 이름표의 최대 폭 — 레이아웃(BUCKET_W)과 렌더가 같은 값을 봐야 한다. */
export const BLOCK_LABEL_W = 175;
/** x 지터 — 같은 날짜에 끝나는 산출물이 완전히 겹쳐 한 점으로 보이지 않게. */
const JITTER_X = 14;

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
  /** 월드 절대 좌표. z는 카메라 평면 기준 깊이(음수=멀리, 양수=가까이). */
  x: number;
  y: number;
  z: number;
  /** 구체 지름. */
  d: number;
  /** 이 산출물이 걸린 phase 이름. 유실이면 null. */
  phaseName: string | null;
  /** 일정을 잃은 산출물 — 날짜축 위에 놓을 자리가 없어 왼쪽 "미배치 구역"에 뜬다. */
  orphan: boolean;
}

export interface WorkflowRowLayout {
  workflow: WorkflowDto;
  /** 월드 절대 y (행 중심). */
  y: number;
  blocks: BlockNode[];
  released: number;
  total: number;
  orphans: number;
}

/** 같은 workflow 안의 산출물 두 개를 잇는 얇은 곡선 — 월드 절대 좌표의 SVG path. */
export interface WireLink {
  id: string;
  fromId: string;
  toId: string;
  path: string;
}

/** 도메인 하나가 차지하는 세로 구역. 테두리가 아니라 "여기서부터"를 알리는 문턱이다. */
export interface DomainZoneLayout {
  key: string;
  label: string;
  color: string;
  /** 월드 절대 y — 구역 상단 / 높이. */
  y: number;
  h: number;
  rows: WorkflowRowLayout[];
  wires: WireLink[];
  released: number;
  total: number;
}

/** 날짜축 위의 과제 마일스톤 구간 — 화면 전체를 세로로 가로지르는 배경 밴드. */
export interface MilestoneBand {
  id: string;
  name: string;
  x: number;
  w: number;
  state: 'past' | 'current' | 'upcoming';
}

export interface WorldLayout {
  zones: DomainZoneLayout[];
  bands: MilestoneBand[];
  /** 눈금(월 시작)의 x 좌표. */
  ticks: { x: number; label: string }[];
  /** 오늘 날짜의 x. 범위 밖이면 null. */
  todayX: number | null;
  /** 날짜축의 x 시작/끝. */
  axis: { x0: number; x1: number };
  /** 유실 산출물을 모아 두는 구역의 x 중심 — 날짜축 왼쪽 바깥이다. */
  unscheduledX: number;
  bounds: { x: number; y: number; w: number; h: number };
}

/** 두 점을 잇는 완만한 곡선 — 직선이면 중간에 낀 구체를 그대로 관통해 버린다. */
function wirePath(id: string, x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy) || 1;
  const px = -dy / dist;
  const py = dx / dist;
  const bend = Math.min(70, Math.max(20, dist * 0.22));
  const sign = rand01(`${id}:bend`) < 0.5 ? 1 : -1;
  const c1x = x1 + dx * 0.33 + px * bend * sign;
  const c1y = y1 + dy * 0.33 + py * bend * sign;
  const c2x = x1 + dx * 0.67 - px * bend * sign;
  const c2y = y1 + dy * 0.67 - py * bend * sign;
  return `M ${x1} ${y1} C ${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`;
}

function bandState(start: string, end: string, now: number): MilestoneBand['state'] {
  if (now < dayMs(start)) return 'upcoming';
  if (now > dayMs(end) + DAY_MS) return 'past';
  return 'current';
}

/**
 * 도메인 그룹 + 마일스톤 + 산출물로 월드 전체 배치를 만든다.
 *
 * @param milestones 과제 공통 일정 — 배경 밴드이자 날짜축 범위의 일부.
 * @param deliverablesByWorkflow workflowId → 그 workflow가 주는 산출물(own).
 * @param edgesByWorkflow workflowId → 그 workflow 안의 산출물↔산출물 flow.
 */
export function buildWorldLayout(
  domains: DomainGroup[],
  milestones: Milestone[],
  deliverablesByWorkflow: Map<string, DeliverableDto[]>,
  edgesByWorkflow: Map<string, EdgeDto[]>,
  now = Date.now(),
): WorldLayout {
  const allPhases = domains.flatMap((d) => d.workflows.flatMap((w) => w.phases ?? []));
  const range: DateRange = rangeOf(milestones, allPhases) ?? {
    startMs: now,
    endMs: now + 365 * DAY_MS,
  };
  const days = Math.max(1, Math.round((range.endMs - range.startMs) / DAY_MS));
  const axisW = Math.max(MIN_AXIS_W, Math.round(days * PX_PER_DAY));
  // 왼쪽부터 [workflow 라벨][일정 없음 구역][날짜축] 순으로 자리를 나눠 준다 —
  // 셋이 서로 겹치면 유실 산출물의 이름표가 workflow 이름 위에 올라타 버린다.
  const x0 = LABEL_W + UNSCHEDULED_W;
  const x1 = x0 + axisW;
  const xOfMs = (ms: number) => x0 + ratioIn(range, ms) * axisW;
  const xOfDate = (iso: string) => xOfMs(dayMs(iso));
  /** 일정을 잃은 산출물이 모이는 자리 — 축 바깥이라 "축 위에 없다"가 그대로 보인다. */
  const unscheduledX = LABEL_W + UNSCHEDULED_W / 2;

  const zones: DomainZoneLayout[] = [];
  let cursorY = 0;

  domains.forEach((domain) => {
    const zoneTop = cursorY;
    const contentY = zoneTop + DOMAIN_HEAD_H;
    const centerOf = new Map<string, { x: number; y: number }>();

    const rows: WorkflowRowLayout[] = domain.workflows.map((workflow, ri) => {
      const rowY = contentY + ri * ROW_H + ROW_H / 2;
      const phaseById = new Map((workflow.phases ?? []).map((p) => [p.id, p]));
      const items = deliverablesByWorkflow.get(workflow.id) ?? [];

      // 같은 x에 몰린 것들을 세로로 살짝 벌리기 위해, 먼저 x를 계산해 버킷으로 묶는다.
      const withX = items.map((d) => {
        const phase = phaseById.get(d.phaseId) ?? null;
        const orphan = !phase;
        const baseX = phase ? xOfDate(phase.end) : unscheduledX;
        const jitter = (rand01(`${d.id}:x`) - 0.5) * 2 * JITTER_X;
        return { d, phase, orphan, x: baseX + jitter };
      });
      const bucketOf = (x: number) => Math.round(x / BUCKET_W);
      const bucketCount = new Map<number, number>();
      withX.forEach((it) => {
        const b = bucketOf(it.x);
        bucketCount.set(b, (bucketCount.get(b) ?? 0) + 1);
      });
      const bucketSeen = new Map<number, number>();

      let released = 0;
      let orphans = 0;
      const blocks: BlockNode[] = withX.map(({ d, phase, orphan, x }) => {
        const status = statusOf(d);
        if (status === 'released') released++;
        if (orphan) orphans++;
        const b = bucketOf(x);
        const n = bucketCount.get(b) ?? 1;
        const k = bucketSeen.get(b) ?? 0;
        bucketSeen.set(b, k + 1);
        // 같은 버킷의 것들을 행 중심 기준 위아래로 대칭 분산.
        const y = rowY + (k - (n - 1) / 2) * STACK_Y;
        // z는 순수하게 "떠 있는 느낌"을 위한 축 — 데이터와 무관한 결정적 난수다.
        const z = (rand01(`${d.id}:z`) - 0.5) * 2 * Z_SPREAD;
        // 가까운 것(z>0)이 조금 더 크게 — perspective가 처리하지만, 지름 자체도
        // 살짝 섞어 두면 같은 깊이에 몰려 보이지 않는다.
        const dia = BLOCK_D * (0.82 + rand01(`${d.id}:d`) * 0.42);
        const block: BlockNode = {
          id: d.id, name: d.name, docType: d.docType, status,
          x, y, z, d: dia, phaseName: phase?.name ?? null, orphan,
        };
        centerOf.set(d.id, { x, y });
        return block;
      });

      return { workflow, y: rowY, blocks, released, total: items.length, orphans };
    });

    const wires: WireLink[] = domain.workflows.flatMap((workflow) => (
      (edgesByWorkflow.get(workflow.id) ?? []).flatMap((e) => {
        const a = centerOf.get(e.fromId);
        const b = centerOf.get(e.toId);
        if (!a || !b) return [];
        return [{ id: e._id, fromId: e.fromId, toId: e.toId, path: wirePath(e._id, a.x, a.y, b.x, b.y) }];
      })
    ));

    const zoneH = DOMAIN_HEAD_H + Math.max(1, rows.length) * ROW_H;
    zones.push({
      key: domain.key,
      label: domain.label,
      color: domain.color,
      y: zoneTop,
      h: zoneH,
      rows,
      wires,
      released: domain.counts.released,
      total: domain.counts.total,
    });
    cursorY = zoneTop + zoneH + DOMAIN_GAP;
  });

  const worldH = Math.max(400, cursorY - DOMAIN_GAP);

  const bands: MilestoneBand[] = milestones.map((m) => {
    const bx = xOfDate(m.start);
    return {
      id: m.id,
      name: m.name,
      x: bx,
      w: Math.max(2, xOfDate(m.end) + (DAY_MS / (range.endMs - range.startMs)) * axisW - bx),
      state: bandState(m.start, m.end, now),
    };
  });

  const ticks: { x: number; label: string }[] = [];
  {
    const d = new Date(range.startMs);
    d.setDate(1);
    if (d.getTime() < range.startMs) d.setMonth(d.getMonth() + 1);
    while (d.getTime() <= range.endMs) {
      ticks.push({
        x: xOfMs(d.getTime()),
        label: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`,
      });
      d.setMonth(d.getMonth() + 1);
    }
  }

  const todayX = now >= range.startMs && now <= range.endMs ? xOfMs(now) : null;

  return {
    zones,
    bands,
    ticks,
    todayX,
    axis: { x0, x1 },
    unscheduledX,
    bounds: { x: 0, y: -DOMAIN_HEAD_H, w: x1 + TAIL_W, h: worldH + DOMAIN_HEAD_H },
  };
}

/**
 * 클릭한 산출물 기준 flow 연결 집합 — workflow 캔버스의 connectedSet(canvasModel.ts)과
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
