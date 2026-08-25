/**
 * "Total workflow view"(전체 워크플로 우주 지도)의 순수 레이아웃 계산.
 *
 * 은유: **Domain = 항성계(system) / IP = 행성(planet) / 산출물 흐름 = 항로(flow)**.
 * IP가 많아지면 한 판에 다 담기 어렵기 때문에 도메인별로 좌표 영역 자체를 분리해
 * 각 도메인이 독립된 항성계로 보이게 하고, 도메인 간 핸드오프만 긴 항로로 잇는다.
 *
 * 이 파일은 React/DOM을 전혀 모른다 — 좌표와 통계만 만들어 준다.
 * 도메인 값은 `IpDto.domain`에서 온다. 아직 BE에 domain 필드가 없는 데이터도
 * 깨지지 않도록 비어 있으면 UNASSIGNED_DOMAIN으로 묶는다.
 */
import { DeliverableDto, IpDto } from '@/types/domain';

export const UNASSIGNED_DOMAIN = 'UNASSIGNED';

/** 항성계 코어 색 — 도메인 이름 해시로 고정 배정해 새로고침해도 색이 안 바뀌게 한다. */
const SYSTEM_PALETTE = [
  '#3ddbc0', '#8b7bff', '#4aa3ff', '#ffb020',
  '#ff6b9d', '#42d7f5', '#a3e635', '#ff8a5b',
];

/* ── 레이아웃 상수 ── */
const RING_BASE = 210;
const RING_STEP = 155;
const SYSTEM_PAD = 105;
const SYSTEM_GAP = 190;
const PLANET_MIN_R = 26;
const PLANET_MAX_R = 50;

export interface StatusCounts {
  released: number;
  inProgress: number;
  notSubmitted: number;
  total: number;
}

export interface PlanetNode {
  id: string;
  ip: IpDto;
  domain: string;
  /** 월드 좌표(항성계 중심 기준이 아니라 절대 좌표). */
  x: number;
  y: number;
  r: number;
  ring: number;
  orbitR: number;
  angleDeg: number;
  counts: StatusCounts;
  /** released / total (0..1) */
  progress: number;
  /** 다른 IP가 아니라 외부 부서(digital/solution/…)로 나가는 산출물 수. */
  externalOut: number;
  /** 이 IP의 산출물 목록을 아직 못 받아온 상태. */
  loading: boolean;
}

export interface SystemNode {
  key: string;
  label: string;
  color: string;
  cx: number;
  cy: number;
  /** 별부터 가장 바깥 궤도 + 여백까지 — 포커스 줌 계산에 쓴다. */
  radius: number;
  orbits: number[];
  planets: PlanetNode[];
  counts: StatusCounts;
}

export interface FlowLink {
  id: string;
  from: string;
  to: string;
  fromDomain: string;
  toDomain: string;
  /** 서로 다른 항성계를 잇는 항로 — 화면에서 다르게 그린다. */
  crossSystem: boolean;
  total: number;
  released: number;
  color: string;
  names: string[];
}

export interface UniverseModel {
  systems: SystemNode[];
  planets: PlanetNode[];
  planetById: Map<string, PlanetNode>;
  flows: FlowLink[];
  counts: StatusCounts;
  bounds: { x: number; y: number; w: number; h: number };
}

/* ── 색 유틸 (행성 그라디언트용) ──
 * IP 색은 항상 hex지만 팔레트 상수에는 rgba()도 섞여 있어서(SPACE.dm2 등)
 * 두 표기를 모두 받아 준다 — 아니면 NaN이 섞인 색 문자열이 조용히 무시된다. */
function toRgb(color: string): [number, number, number] {
  const m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = color.replace('#', '');
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(s.slice(0, 6) || '888888', 16);
  if (Number.isNaN(n)) return [136, 136, 136];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** hex를 target 쪽으로 amt(0..1)만큼 섞는다. */
export function mixHex(hex: string, target: string, amt: number): string {
  const a = toRgb(hex);
  const b = toRgb(target);
  const m = a.map((v, i) => Math.round(v + (b[i] - v) * amt));
  return `#${m.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function lighten(hex: string, amt: number) { return mixHex(hex, '#ffffff', amt); }
export function darken(hex: string, amt: number) { return mixHex(hex, '#050914', amt); }

export function withAlpha(hex: string, alpha: number) {
  const [r, g, b] = toRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** 도메인 하나의 기본 색 — 해시라서 프로젝트가 달라도 같은 도메인은 같은 색이다. */
export function systemColor(domain: string) {
  return SYSTEM_PALETTE[hashCode(domain) % SYSTEM_PALETTE.length];
}

/**
 * 한 화면에 같이 뜨는 도메인들끼리는 색이 겹치면 안 된다 — 해시가 같은 슬롯을 가리키면
 * 다음 빈 슬롯으로 밀어 준다(팔레트보다 도메인이 많아지면 그때부터는 다시 겹친다).
 */
function assignColors(keys: string[]): Map<string, string> {
  const used = new Set<number>();
  const out = new Map<string, string>();
  keys.forEach((k) => {
    const want = hashCode(k) % SYSTEM_PALETTE.length;
    let slot = want;
    for (let i = 0; i < SYSTEM_PALETTE.length && used.has(slot); i++) {
      slot = (slot + 1) % SYSTEM_PALETTE.length;
    }
    used.add(slot);
    out.set(k, SYSTEM_PALETTE[slot]);
  });
  return out;
}

export function statusOf(d: DeliverableDto): 'released' | 'inProgress' | 'notSubmitted' {
  if (!d.versions.length) return 'notSubmitted';
  return d.workingVersion ? 'inProgress' : 'released';
}

function emptyCounts(): StatusCounts {
  return { released: 0, inProgress: 0, notSubmitted: 0, total: 0 };
}

function addCounts(a: StatusCounts, b: StatusCounts): StatusCounts {
  return {
    released: a.released + b.released,
    inProgress: a.inProgress + b.inProgress,
    notSubmitted: a.notSubmitted + b.notSubmitted,
    total: a.total + b.total,
  };
}

function countStatuses(items: DeliverableDto[]): StatusCounts {
  const c = emptyCounts();
  items.forEach((d) => {
    c[statusOf(d)]++;
    c.total++;
  });
  return c;
}

/**
 * n개 행성을 몇 겹의 궤도에 어떻게 나눌지. 안쪽 궤도가 먼저 차되 마지막 궤도에
 * 행성 하나만 덩그러니 남지 않도록 궤도 용량 비율대로 분배한다.
 */
function ringPlan(n: number): number[] {
  if (n <= 0) return [];
  const caps: number[] = [];
  let total = 0;
  while (total < n) {
    caps.push(4 + caps.length * 3);
    total = caps.reduce((a, b) => a + b, 0);
  }
  const out = caps.map(() => 0);
  let left = n;
  for (let i = 0; i < caps.length; i++) {
    if (i === caps.length - 1) { out[i] = left; break; }
    const remaining = caps.slice(i).reduce((a, b) => a + b, 0);
    const take = Math.max(0, Math.min(caps[i], Math.round((left * caps[i]) / remaining)));
    out[i] = take;
    left -= take;
  }
  return out.filter((v, i) => v > 0 || i === 0);
}

function planetRadius(total: number) {
  return Math.round(Math.min(PLANET_MAX_R, PLANET_MIN_R + Math.sqrt(total) * 5.2));
}

/** IP의 도메인 — BE에 domain 필드가 아직 없으면 UNASSIGNED로 모은다. */
export function domainOf(ip: IpDto): string {
  const raw = (ip.domain ?? '').trim();
  return raw ? raw.toUpperCase() : UNASSIGNED_DOMAIN;
}

/**
 * IP 목록 + IP별 산출물로 우주 지도를 만든다.
 * @param deliverablesByIp ipId → 그 IP가 "주는" 산출물(own). incoming은 반대편에서
 *   이미 한 번 세므로 넣지 않는다(항로 중복 방지).
 * @param loadingIpIds 아직 로딩 중인 IP — 행성은 그리되 통계는 비운다.
 */
export function buildUniverse(
  ips: IpDto[],
  deliverablesByIp: Map<string, DeliverableDto[]>,
  loadingIpIds: Set<string> = new Set(),
): UniverseModel {
  /* 1) 도메인별로 IP를 나눈다 — 이름순 정렬로 항상 같은 자리에 오게. */
  const grouped = new Map<string, IpDto[]>();
  ips.forEach((ip) => {
    const key = domainOf(ip);
    const arr = grouped.get(key) ?? [];
    arr.push(ip);
    grouped.set(key, arr);
  });

  const domainKeys = [...grouped.keys()].sort((a, b) => {
    // UNASSIGNED는 항상 맨 뒤 — 도메인이 아직 안 붙은 IP 모음이라는 뜻이라서.
    if (a === UNASSIGNED_DOMAIN) return 1;
    if (b === UNASSIGNED_DOMAIN) return -1;
    const d = (grouped.get(b)?.length ?? 0) - (grouped.get(a)?.length ?? 0);
    return d !== 0 ? d : a.localeCompare(b);
  });

  const colorOf = assignColors(domainKeys);

  /* 2) 각 항성계의 내부 배치(중심 기준 상대 좌표)를 먼저 계산해 반경을 구한다. */
  interface DraftPlanet extends Omit<PlanetNode, 'x' | 'y'> {
    /** 항성계 중심 기준 상대 좌표. */
    rx: number;
    ry: number;
  }
  interface Draft {
    key: string;
    color: string;
    orbits: number[];
    radius: number;
    planets: DraftPlanet[];
  }
  const drafts = domainKeys.map((key) => {
    const members = [...(grouped.get(key) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const plan = ringPlan(members.length);
    // IP가 한둘뿐인 도메인까지 같은 궤도 반경을 쓰면 영역 안이 텅 비어 보인다 —
    // 식구 수에 따라 가장 안쪽 궤도를 조여 준다(4개 이상이면 기본값 그대로).
    const tight = 0.58 + 0.42 * Math.min(1, members.length / 4);
    const orbits = plan.map((_, i) => Math.round(RING_BASE * tight) + i * RING_STEP);

    let idx = 0;
    let maxR = 0;
    const placed: DraftPlanet[] = plan.flatMap((count, ring) => {
      const orbitR = orbits[ring];
      // 궤도마다 황금각만큼 위상을 틀어 안/바깥 행성이 일직선으로 겹치지 않게 한다.
      const phase = ring * 137.5 - 90;
      return Array.from({ length: count }, (_, j) => {
        const ip = members[idx++];
        const items = deliverablesByIp.get(ip.id) ?? [];
        const counts = countStatuses(items);
        const r = planetRadius(counts.total);
        maxR = Math.max(maxR, r);
        const angleDeg = phase + (360 / count) * j;
        const rad = (angleDeg * Math.PI) / 180;
        return {
          id: ip.id,
          ip,
          domain: key,
          r,
          ring,
          orbitR,
          angleDeg,
          counts,
          progress: counts.total ? counts.released / counts.total : 0,
          externalOut: items.filter((d) => !d.recvIpId && (d.recvDept || d.recvContact)).length,
          loading: loadingIpIds.has(ip.id),
          rx: Math.cos(rad) * orbitR,
          ry: Math.sin(rad) * orbitR,
        };
      });
    });

    const draft: Draft = {
      key,
      color: colorOf.get(key) ?? systemColor(key),
      orbits,
      radius: (orbits[orbits.length - 1] ?? RING_BASE) + maxR + SYSTEM_PAD,
      planets: placed,
    };
    return draft;
  });

  /* 3) 항성계를 격자에 배치.
   * 셀을 전부 "가장 큰 항성계" 크기로 잡으면 IP 하나짜리 도메인 둘레가 텅 비어 지도가
   * 필요 이상으로 넓어진다. 그래서 열 너비/행 높이를 그 줄에 실제로 들어간 항성계
   * 기준으로 따로 잡는다. */
  const cols = Math.max(1, Math.ceil(Math.sqrt(drafts.length)));
  const rowCount = Math.max(1, Math.ceil(drafts.length / cols));
  const spanOf = (pick: (i: number) => boolean) =>
    drafts.reduce((m, d, i) => (pick(i) ? Math.max(m, d.radius) : m), RING_BASE) * 2 + SYSTEM_GAP;
  const colW = Array.from({ length: cols }, (_, c) => spanOf((i) => i % cols === c));
  const rowH = Array.from({ length: rowCount }, (_, r) => spanOf((i) => Math.floor(i / cols) === r));
  const prefix = (arr: number[]) => arr.reduce<number[]>((acc, v) => [...acc, acc[acc.length - 1] + v], [0]);
  const colX = prefix(colW);
  const rowY = prefix(rowH);

  const systems: SystemNode[] = [];
  const planets: PlanetNode[] = [];

  drafts.forEach((d, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = colX[col] + colW[col] / 2;
    const cy = rowY[row] + rowH[row] / 2;
    const sysPlanets: PlanetNode[] = d.planets.map(({ rx, ry, ...rest }) => {
      const node: PlanetNode = { ...rest, x: cx + rx, y: cy + ry };
      planets.push(node);
      return node;
    });
    systems.push({
      key: d.key,
      label: d.key,
      color: d.color,
      cx,
      cy,
      radius: d.radius,
      orbits: d.orbits,
      planets: sysPlanets,
      counts: sysPlanets.reduce((acc, p) => addCounts(acc, p.counts), emptyCounts()),
    });
  });

  const planetById = new Map(planets.map((p) => [p.id, p]));

  /* 4) 항로 — recvIpId가 가리키는 IP가 이 지도 안에 있을 때만 잇는다. */
  const flowMap = new Map<string, FlowLink>();
  deliverablesByIp.forEach((items, ipId) => {
    const src = planetById.get(ipId);
    if (!src) return;
    items.forEach((d) => {
      if (!d.recvIpId) return;
      const dst = planetById.get(d.recvIpId);
      if (!dst || dst.id === src.id) return;
      const id = `${src.id}->${dst.id}`;
      const cur = flowMap.get(id) ?? {
        id,
        from: src.id,
        to: dst.id,
        fromDomain: src.domain,
        toDomain: dst.domain,
        crossSystem: src.domain !== dst.domain,
        total: 0,
        released: 0,
        color: src.ip.color || colorOf.get(src.domain) || systemColor(src.domain),
        names: [],
      };
      cur.total++;
      if (statusOf(d) === 'released') cur.released++;
      cur.names.push(d.name);
      flowMap.set(id, cur);
    });
  });

  /* 5) 전체 바운딩 박스 — 초기 fit 계산용. */
  const bounds = { x: 0, y: 0, w: colX[cols], h: rowY[rowCount] };

  return {
    systems,
    planets,
    planetById,
    flows: [...flowMap.values()],
    counts: systems.reduce((acc, s) => addCounts(acc, s.counts), emptyCounts()),
    bounds,
  };
}

/**
 * 두 행성을 잇는 2차 베지에 항로. 행성 표면에서 시작/끝나도록 반지름만큼 물러나고,
 * 진행 방향 화살촉 좌표까지 함께 돌려준다.
 */
export function flowGeometry(a: PlanetNode, b: PlanetNode, crossSystem: boolean) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  // 항로가 서로 겹치지 않게 방향에 따라 휘는 쪽을 고정한다(A→B와 B→A가 갈라지도록).
  const side = a.x + a.y <= b.x + b.y ? 1 : -1;
  const bend = (crossSystem ? 0.14 : 0.26) * len * side;
  const cx = (a.x + b.x) / 2 + nx * bend;
  const cy = (a.y + b.y) / 2 + ny * bend;

  const pull = (from: PlanetNode, pad: number) => {
    const vx = cx - from.x;
    const vy = cy - from.y;
    const l = Math.hypot(vx, vy) || 1;
    return { x: from.x + (vx / l) * (from.r + pad), y: from.y + (vy / l) * (from.r + pad) };
  };
  const s = pull(a, 8);
  const e = pull(b, 15);

  // 종점 접선 = (끝점 - 제어점) 방향.
  const tx = e.x - cx;
  const ty = e.y - cy;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl;
  const uy = ty / tl;
  const px = -uy;
  const py = ux;
  const head = 9;
  const arrow = [
    `${e.x + ux * head},${e.y + uy * head}`,
    `${e.x - ux * 2 + px * head * 0.55},${e.y - uy * 2 + py * head * 0.55}`,
    `${e.x - ux * 2 - px * head * 0.55},${e.y - uy * 2 - py * head * 0.55}`,
  ].join(' ');

  return { d: `M${s.x},${s.y} Q${cx},${cy} ${e.x},${e.y}`, arrow, length: len };
}

/** 별 좌표를 결정적으로 뽑기 위한 아주 작은 PRNG (mulberry32). */
export function seededStars(seed: number, count: number, w: number, h: number) {
  let t = seed >>> 0;
  const rnd = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: rnd() * w,
    y: rnd() * h,
    r: 0.35 + rnd() * 1.5,
    o: 0.25 + rnd() * 0.6,
    delay: rnd() * 6,
  }));
}
