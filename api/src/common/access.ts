/**
 * 3계층 권한 판정 (설계서 01장).
 *
 *   Admin ─────────────────────────── 전 계층 무조건 통과
 *     ├─ Project    members 에 있는가?          ← 없으면 그 아래는 볼 것도 없다
 *     │   ├─ Workflow  Owner / Edit / View 인가?
 *     │   └─ Artifact  A: recipient(게이트) → 서비스 권한(게이트)
 *     │                B/C/D: SIREN artifact 권한
 *
 * 이 파일은 **순수 함수만** 담는다 — 모델 조회도, 외부 호출도 하지 않는다. 그래야 Guard,
 * 서비스, DTO 마스킹이 전부 같은 판정을 쓰고 어긋나지 않는다. A Tier의 두 번째 게이트
 * (그 서비스에 canView를 물어보는 것)만 I/O가 필요해서 ArtifactAccessService가 담당한다.
 */
import { Actor } from './actor';

export type AccessLevel = 'edit' | 'view' | null;

/** AccessGrant 스키마와 같은 모양의 순수 데이터. */
export interface GrantLike {
  departments?: string[];
  users?: string[];
}

export interface ProjectLike {
  members?: { knoxId: string; departments?: string[] }[];
  departments?: string[];
  managers?: string[];
}

export interface WorkflowLike {
  ownerKnoxId?: string;
  department?: string;
  editAccess?: GrantLike;
  viewAccess?: GrantLike;
}

/* ------------------------------------------------------------------ *
 * Project 계층
 * ------------------------------------------------------------------ */

/**
 * ★ 이 규칙이 최우선이다. members에 없는 사람은 어떤 workflow의 View Access를 받았더라도
 *   그 과제와 그 안의 어떤 것도 볼 수 없다 — 라우팅으로 우회해도 차단된다(설계서 01장 §2.2).
 *
 * 반대로 **권한 부여 자체는 project member 여부와 무관하게 가능하다**(§3.3, §4.3).
 * 아직 members에 없는 사람에게 미리 권한을 줘 두고, 나중에 members에 추가되는 순간
 * 실제로 열리는 순서가 정상 시나리오다.
 */
export function canAccessProject(actor: Actor, project: ProjectLike | null | undefined): boolean {
  if (actor.isAdmin) return true;
  if (!project) return false;
  return (project.members ?? []).some((m) => m.knoxId === actor.knoxId);
}

/**
 * "내가 이 과제에서 속한 부서" — **그 과제의 members 로스터 기준**이다(전사 소속이 아니라).
 * 같은 사람이 과제마다 다른 부서일 수 있기 때문이다.
 *
 * Admin은 그 과제의 전체 부서를 가진 것으로 본다 — 부서 dropdown 후보와 부서 단위 권한
 * 판정 양쪽에서 super 권한이 자연스럽게 성립한다.
 */
export function myDepartments(actor: Actor, project: ProjectLike | null | undefined): string[] {
  if (!project) return [];
  if (actor.isAdmin) return [...(project.departments ?? [])];
  const me = (project.members ?? []).find((m) => m.knoxId === actor.knoxId);
  return [...(me?.departments ?? [])];
}

/**
 * 마일스톤(과제 공통 일정) 편집 권한. workflow Edit Access와는 별개 역할이며,
 * Manager라고 해서 workflow가 더 보이지는 않는다(설계서 01장 §2.3, 가정 P4).
 */
export function canEditMilestones(actor: Actor, project: ProjectLike | null | undefined): boolean {
  if (actor.isAdmin) return true;
  return Boolean(project?.managers?.includes(actor.knoxId));
}

/* ------------------------------------------------------------------ *
 * 권한 한 벌 매칭
 * ------------------------------------------------------------------ */

/**
 * 부서 단위 권한은 **조회 시점에 실시간으로** 판정한다 — 부여 시점의 멤버를 얼려두지
 * 않으므로, 나중에 그 부서에 합류한 사람도 즉시 권한을 얻고 떠나면 즉시 잃는다.
 */
export function matchesGrant(
  actor: Actor,
  grant: GrantLike | null | undefined,
  myDepts: string[],
): boolean {
  if (!grant) return false;
  if ((grant.users ?? []).includes(actor.knoxId)) return true;
  return (grant.departments ?? []).some((d) => myDepts.includes(d));
}

/**
 * edit / view 두 벌을 한 번에 판정한다.
 *
 * ★ Edit과 View에 **동시 등록되는 것을 허용**한다(부서 목록이 겹칠 수 있으므로).
 *   이때 실효 권한은 항상 **더 높은 Edit**이다 — edit을 먼저 검사하므로 자연히 그렇게 된다.
 */
export function grantLevel(
  actor: Actor,
  editAccess: GrantLike | null | undefined,
  viewAccess: GrantLike | null | undefined,
  myDepts: string[],
): AccessLevel {
  if (matchesGrant(actor, editAccess, myDepts)) return 'edit';
  if (matchesGrant(actor, viewAccess, myDepts)) return 'view';
  return null;
}

/* ------------------------------------------------------------------ *
 * Workflow 계층
 * ------------------------------------------------------------------ */

/**
 * Project 계층을 먼저 통과해야 한다 — 그 과제의 member가 아니면 무조건 null이다.
 */
export function workflowLevel(
  actor: Actor,
  workflow: WorkflowLike | null | undefined,
  project: ProjectLike | null | undefined,
): AccessLevel {
  if (actor.isAdmin) return 'edit';
  if (!workflow) return null;
  if (!canAccessProject(actor, project)) return null;
  if (workflow.ownerKnoxId === actor.knoxId) return 'edit';
  return grantLevel(actor, workflow.editAccess, workflow.viewAccess, myDepartments(actor, project));
}

export function canEditWorkflow(
  actor: Actor,
  workflow: WorkflowLike | null | undefined,
  project: ProjectLike | null | undefined,
): boolean {
  return workflowLevel(actor, workflow, project) === 'edit';
}

export function canViewWorkflow(
  actor: Actor,
  workflow: WorkflowLike | null | undefined,
  project: ProjectLike | null | undefined,
): boolean {
  return workflowLevel(actor, workflow, project) !== null;
}

/* ------------------------------------------------------------------ *
 * Artifact 계층 — 1단계(SIREN 쪽)
 * ------------------------------------------------------------------ */

export interface ArtifactLike {
  tier?: string;
  editAccess?: GrantLike;
  viewAccess?: GrantLike;
}

export interface BlockLike {
  recipients?: { editAccess?: GrantLike; viewAccess?: GrantLike };
}

/**
 * B/C/D — SIREN이 artifact 단위로 들고 있는 권한. **artifact 하나에 붙어 그 과제 안의
 * 모든 workflow가 같은 값을 본다**(Calypso/HPC 공용 DB처럼 중앙 관리되므로).
 *
 * ★ workflow Edit Access가 있어도 artifact 권한이 없으면 null이다 — 실무적으로는
 *   artifact 권한도 부서 단위로 넣기 때문에 대개 함께 갖게 되지만, 판정의 근거는
 *   어디까지나 artifact 권한이다(설계서 01장 §4.2).
 */
export function sirenArtifactLevel(
  actor: Actor,
  artifact: ArtifactLike | null | undefined,
  myDepts: string[],
): AccessLevel {
  if (actor.isAdmin) return 'edit';
  if (!artifact) return null;
  return grantLevel(actor, artifact.editAccess, artifact.viewAccess, myDepts);
}

/**
 * A Tier의 **게이트 1** — SIREN이 관리하는 recipient. 그 workflow의 block에 저장되어 있어
 * 같은 artifact라도 workflow마다 다를 수 있다(설계서 01장 §4.1).
 *
 * ★ workflow Edit Access가 있어도 recipient가 아니면 null이다. 예전 설계의
 *   "workflow Edit Access는 항상 통과" 규칙은 폐지되었다(설계서 04장 §4.1).
 *   그래서 workflow를 만든 사람이 자기가 등록한 A Tier 산출물의 slide를 못 여는 상황이
 *   생길 수 있는데, **의도된 동작**이다 — recipient를 편집하는 권한과 recipient에
 *   속하는 것은 별개다.
 */
export function recipientLevel(
  actor: Actor,
  block: BlockLike | null | undefined,
  myDepts: string[],
): AccessLevel {
  if (actor.isAdmin) return 'edit';
  if (!block?.recipients) return null;
  return grantLevel(actor, block.recipients.editAccess, block.recipients.viewAccess, myDepts);
}

/* ------------------------------------------------------------------ *
 * 권한 한 벌 편집 헬퍼
 * ------------------------------------------------------------------ */

export interface NormalizedGrant {
  departments: string[];
  users: string[];
}

/** 중복 제거 + 공백 정리. 순서는 입력 순서를 유지한다(화면 표시 순서가 흔들리지 않게). */
export function normalizeGrant(grant: GrantLike | null | undefined): NormalizedGrant {
  const clean = (xs: string[] | undefined) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of xs ?? []) {
      const v = typeof raw === 'string' ? raw.trim() : '';
      if (!v || seen.has(v)) continue;
      seen.add(v);
      out.push(v);
    }
    return out;
  };
  return { departments: clean(grant?.departments), users: clean(grant?.users) };
}

/**
 * workflow의 department가 바뀔 때 editAccess.departments를 교체한다(설계서 01장 §3.5).
 *
 * 하는 일은 정확히 둘뿐이다 — 이전 부서를 빼고 새 부서를 넣는다. **다른 부서, 개별
 * 사용자, viewAccess는 절대 건드리지 않는다.** 새 부서가 이미 viewAccess에 있어도
 * 제거하지 않는다(동시 등록 허용).
 */
export function swapWorkflowDepartment(
  editAccess: GrantLike | null | undefined,
  previousDepartment: string,
  nextDepartment: string,
): NormalizedGrant {
  const current = normalizeGrant(editAccess);
  const departments = current.departments.filter((d) => d !== previousDepartment);
  if (!departments.includes(nextDepartment)) departments.push(nextDepartment);
  return { departments, users: current.users };
}

/**
 * workflow 소속 부서는 editAccess에서 **삭제할 수 없다 — Admin도 불가**하다
 * (설계서 01장 §3.4). 클라이언트가 그 항목을 뺀 채로 access를 통째로 PUT해도
 * 서버가 다시 넣어 준다.
 */
export function pinWorkflowDepartment(
  editAccess: GrantLike | null | undefined,
  department: string,
): NormalizedGrant {
  const current = normalizeGrant(editAccess);
  if (department && !current.departments.includes(department)) {
    current.departments.unshift(department);
  }
  return current;
}
