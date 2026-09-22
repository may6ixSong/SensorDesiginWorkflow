/**
 * Design Workflow view의 순수 데이터 모델 — 과제의 모든 IP를 도메인(Analog/Digital/
 * APS…) 단위 영역으로 나눈다. workflow↔workflow(도메인을 넘나드는) 산출물 handoff는 이 화면의
 * 관심사가 아니다 — 주고/받는 두 workflow 입장에서는 "같은 산출물" 하나일 뿐이라 별도
 * 연결선이 필요 없다는 게 이 화면의 전제다(요청). 대신 같은 workflow 안의 산출물↔산출물
 * flow(EdgeDto)는 web/src/lib/designWorkflowLayout.ts가 와이어로 그린다.
 *
 * 도메인 섹션 목록은 IP가 가진 도메인 + `knownDomains`(= 과제에 등록된 Project.departments,
 * 예전 workflowDomains를 대신한다)의 합집합이다. 그래서 아직 IP가 배정되지 않은 부서도
 * 빈 섹션으로 자리를 잡는다 — "이 과제에 어떤 부서가 있는지"가 화면에 그대로 보이는 게 목적이다.
 *
 * React/DOM을 전혀 모르는 순수 함수만 모아 뒀다.
 */
import { DepartmentDto, NodeDto, WorkflowDto } from '@/types/domain';

export const UNASSIGNED_DOMAIN = 'UNASSIGNED';

/**
 * IP가 속한 도메인 — 값은 `Project.departments[].id`다(02장 §9.3).
 *
 * ★ 예전에는 부서 **이름**을 대문자로 올려 키로 썼다(같은 이름의 대소문자 차이를 한 도메인으로
 *   묶기 위해). id로 바뀐 뒤에는 그 정규화가 필요 없을 뿐 아니라 **해서는 안 된다** — id는
 *   대소문자를 구분하는 불투명한 값이라 올려버리면 `departments[]`의 어떤 항목과도 매칭되지
 *   않는다. 사람에게 보이는 이름은 `buildDomainModel`이 `label`에 따로 채운다.
 */
export function domainOf(workflow: WorkflowDto): string {
  return (workflow.department ?? '').trim() || UNASSIGNED_DOMAIN;
}

export interface StatusCounts {
  released: number;
  inProgress: number;
  notSubmitted: number;
  total: number;
}

/**
 * 노드 하나의 상태.
 *
 * 캔버스와 같은 publish 3상태를 쓰되(설계서 03장 §2.2), 이 화면은 "얼마나 진척됐나"를
 * 집계하는 곳이라 세 값을 그대로 쓴다:
 *   newlyPublished — 마지막 release 이후 major가 올라갔다(= 다음 release 대상)
 *   published      — 전달까지 끝났다
 *   unpublished    — 아직 publish된 버전이 없다 (미매핑 노드도 여기에 들어간다)
 */
export function statusOf(n: NodeDto): 'released' | 'inProgress' | 'notSubmitted' {
  if (n.publishState === 'published') return 'released';
  if (n.publishState === 'newlyPublished') return 'inProgress';
  return 'notSubmitted';
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

function countStatuses(items: NodeDto[]): StatusCounts {
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
  workflows: WorkflowDto[];
  counts: StatusCounts;
}

export interface DomainWorkflowModel {
  domains: DomainGroup[];
  counts: StatusCounts;
}

/** 도메인 헤더/사이드바 강조색 — 채도가 있어 라이트/다크 배경 모두에서 식별된다. */
const DOMAIN_PALETTE = [
  '#2f6b4a', '#6b5083', '#2563c9', '#ac6f08', '#c8352c',
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
 * workflow 목록 + IP별 산출물(own)로 도메인 모델을 만든다.
 * @param nodesByWorkflow workflowId → 그 workflow의 캔버스 노드. 다른 workflow의 것은
 *   이미 한 번 세므로 넣지 않는다(항로 중복 방지).
 * @param knownDepartments 과제에 등록된 부서 목록(Project.departments, `{id, name}`). IP가
 *   하나도 배정되지 않은 부서도 빈 섹션으로 보여 주기 위한 것 — 이걸 넘기지 않으면 IP가
 *   실제로 가진 부서만 나온다. **그룹 키는 id, 사람이 읽는 `label`은 여기서 찾은 이름**이라
 *   부서명을 바꾸면 이 화면의 섹션 제목도 같이 따라온다(02장 §9.3).
 */
export function buildDomainModel(
  workflows: WorkflowDto[],
  nodesByWorkflow: Map<string, NodeDto[]>,
  knownDepartments: DepartmentDto[] = [],
): DomainWorkflowModel {
  const nameById = new Map(knownDepartments.map((d) => [d.id, d.name]));
  const grouped = new Map<string, WorkflowDto[]>();
  // 등록된 도메인을 먼저 빈 그룹으로 깔아 둔다 — IP가 없어도 섹션 자리는 만든다.
  knownDepartments.forEach((d) => {
    if (d.id && !grouped.has(d.id)) grouped.set(d.id, []);
  });
  workflows.forEach((workflow) => {
    const key = domainOf(workflow);
    const arr = grouped.get(key) ?? [];
    arr.push(workflow);
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
      (acc, workflow) => addCounts(acc, countStatuses(nodesByWorkflow.get(workflow.id) ?? [])),
      emptyCounts(),
    );
    return {
      key,
      // 지워진 부서를 가리키는 workflow가 남아 있으면 id를 그대로 보여 준다 — 지어내지 않는다.
      label: key === UNASSIGNED_DOMAIN ? UNASSIGNED_DOMAIN : nameById.get(key) ?? key,
      color: colorOf.get(key) ?? DOMAIN_PALETTE[0],
      workflows: members,
      counts,
    };
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
