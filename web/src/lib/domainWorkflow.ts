/**
 * Design Workflow view의 순수 데이터 모델 — 과제의 모든 IP를 도메인(Analog/Digital/
 * APS…) 단위 영역으로 나눈다. IP↔IP(도메인을 넘나드는) 산출물 handoff는 이 화면의
 * 관심사가 아니다 — 주고/받는 두 IP 입장에서는 "같은 산출물" 하나일 뿐이라 별도
 * 연결선이 필요 없다는 게 이 화면의 전제다(요청). 대신 같은 IP 안의 산출물↔산출물
 * flow(EdgeDto)는 web/src/lib/designWorkflowLayout.ts가 와이어로 그린다.
 *
 * 도메인 섹션 목록은 IP가 가진 도메인 + `knownDomains`(= 과제에 등록된 Project.ipDomains)의
 * 합집합이다. 그래서 아직 IP가 배정되지 않은 도메인도 빈 섹션으로 자리를 잡는다 —
 * "이 과제에 어떤 도메인이 있는지"가 화면에 그대로 보이는 게 목적이다.
 *
 * React/DOM을 전혀 모르는 순수 함수만 모아 뒀다.
 */
import { DeliverableDto, IpDto } from '@/types/domain';

export const UNASSIGNED_DOMAIN = 'UNASSIGNED';

/** IP가 속한 도메인 — BE에 domain 필드가 아직 없는 데이터도 깨지지 않게 폴백을 둔다. */
export function domainOf(ip: IpDto): string {
  const raw = (ip.domain ?? '').trim();
  return raw ? raw.toUpperCase() : UNASSIGNED_DOMAIN;
}

export interface StatusCounts {
  released: number;
  inProgress: number;
  notSubmitted: number;
  total: number;
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

export interface DomainGroup {
  key: string;
  label: string;
  color: string;
  ips: IpDto[];
  counts: StatusCounts;
}

export interface DomainWorkflowModel {
  domains: DomainGroup[];
  counts: StatusCounts;
}

/** 도메인 헤더/사이드바 강조색 — 채도가 있어 라이트/다크 배경 모두에서 식별된다. */
const DOMAIN_PALETTE = [
  '#0c9a83', '#5849cf', '#2563c9', '#ac6f08', '#c8352c',
  '#3aa66b', '#b3521e', '#7a4fbf', '#0891b2', '#be185d',
];

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** 화면에 같이 뜨는 도메인끼리는 색이 안 겹치게 — 해시가 같은 슬롯이면 다음 빈 슬롯으로. */
function assignColors(keys: string[]): Map<string, string> {
  const used = new Set<number>();
  const out = new Map<string, string>();
  keys.forEach((k) => {
    const want = hashCode(k) % DOMAIN_PALETTE.length;
    let slot = want;
    for (let i = 0; i < DOMAIN_PALETTE.length && used.has(slot); i++) {
      slot = (slot + 1) % DOMAIN_PALETTE.length;
    }
    used.add(slot);
    out.set(k, DOMAIN_PALETTE[slot]);
  });
  return out;
}

/**
 * IP 목록 + IP별 산출물(own)로 도메인 모델을 만든다.
 * @param deliverablesByIp ipId → 그 IP가 주는 산출물(own). incoming은 반대편에서
 *   이미 한 번 세므로 넣지 않는다(항로 중복 방지).
 * @param knownDomains 과제에 등록된 도메인 목록(Project.ipDomains). IP가 하나도 배정되지
 *   않은 도메인도 빈 섹션으로 보여 주기 위한 것 — 이걸 넘기지 않으면 IP가 실제로 가진
 *   도메인만 나온다. 대소문자는 domainOf()와 같은 기준으로 올려 맞춘다.
 */
export function buildDomainModel(
  ips: IpDto[],
  deliverablesByIp: Map<string, DeliverableDto[]>,
  knownDomains: string[] = [],
): DomainWorkflowModel {
  const grouped = new Map<string, IpDto[]>();
  // 등록된 도메인을 먼저 빈 그룹으로 깔아 둔다 — IP가 없어도 섹션 자리는 만든다.
  knownDomains.forEach((d) => {
    const key = d.trim().toUpperCase();
    if (key && !grouped.has(key)) grouped.set(key, []);
  });
  ips.forEach((ip) => {
    const key = domainOf(ip);
    const arr = grouped.get(key) ?? [];
    arr.push(ip);
    grouped.set(key, arr);
  });

  const domainKeys = [...grouped.keys()].sort((a, b) => {
    if (a === UNASSIGNED_DOMAIN) return 1;
    if (b === UNASSIGNED_DOMAIN) return -1;
    const d = (grouped.get(b)?.length ?? 0) - (grouped.get(a)?.length ?? 0);
    return d !== 0 ? d : a.localeCompare(b);
  });
  const colorOf = assignColors(domainKeys);

  const domains: DomainGroup[] = domainKeys.map((key) => {
    const members = [...(grouped.get(key) ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const counts = members.reduce(
      (acc, ip) => addCounts(acc, countStatuses(deliverablesByIp.get(ip.id) ?? [])),
      emptyCounts(),
    );
    return { key, label: key, color: colorOf.get(key) ?? DOMAIN_PALETTE[0], ips: members, counts };
  });

  return {
    domains,
    counts: domains.reduce((acc, d) => addCounts(acc, d.counts), emptyCounts()),
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function withAlpha(hex: string, alpha: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** hex를 target 쪽으로 amt(0..1)만큼 섞는다 — 구체(sphere) 음영 계산용. */
export function mixHex(hex: string, target: string, amt: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  const m = a.map((v, i) => Math.round(v + (b[i] - v) * amt));
  return `#${m.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function lighten(hex: string, amt: number) { return mixHex(hex, '#ffffff', amt); }
export function darken(hex: string, amt: number) { return mixHex(hex, '#050914', amt); }
