/**
 * FE 권한 판정 (설계서 01장).
 *
 * ★ 여기 있는 판정은 전부 **UX 게이트**일 뿐이다. 실제 차단은 서버가 이미 끝냈고
 *   (WorkflowAccessGuard), 권한 없는 값은 애초에 응답에 담겨 오지도 않는다.
 *   그래서 이 함수들이 하는 일은 "버튼을 보여줄까 말까"를 정하는 것뿐이다.
 *
 * ★ Admin은 시스템 전체 super 권한이다. 서버가 내려주는 myAccess에 이미 반영되어 있지만,
 *   목록 화면처럼 서버 판정 없이 그리는 자리도 있어 isAdmin을 함께 받는다.
 */
import { AccessGrant, ProjectDetailDto, WorkflowDto } from '@/types/domain';

/** 그 workflow를 편집할 수 있는가 — 캔버스 편집, 설정, release 전부 이 게이트를 쓴다. */
export const canEditWorkflow = (
  workflow?: Pick<WorkflowDto, 'myAccess'> | null,
  isAdmin?: boolean,
): boolean => !!isAdmin || workflow?.myAccess === 'edit';

/** 그 workflow를 열어볼 수 있는가. myAccess가 null이면 목록에 disabled로만 보인다. */
export const canViewWorkflow = (
  workflow?: Pick<WorkflowDto, 'myAccess'> | null,
  isAdmin?: boolean,
): boolean => !!isAdmin || (workflow?.myAccess ?? null) !== null;

/**
 * "내가 이 과제에서 속한 부서" — **그 과제의 members 로스터 기준**이다(전사 소속이 아니라).
 * 같은 사람이 과제마다 다른 부서일 수 있기 때문이다(설계서 01장 §2.4).
 *
 * Admin은 그 과제의 전체 부서를 가진 것으로 본다 — workflow 생성/부서 변경 dropdown이
 * 자연스럽게 전체를 보여주게 된다.
 */
export function myDepartments(
  project: Pick<ProjectDetailDto, 'members' | 'departments'> | null | undefined,
  myKnoxId: string | undefined,
  isAdmin?: boolean,
): string[] {
  if (!project) return [];
  if (isAdmin) return [...(project.departments ?? [])];
  return [...(project.members?.find((m) => m.knoxId === myKnoxId)?.departments ?? [])];
}

/**
 * 과제 마일스톤(공통 일정) 편집 권한.
 *
 * workflow Edit Access와는 **별개 role**이다 — Manager가 아니면 편집할 수 없고, 반대로
 * Manager라고 해서 workflow가 더 보이지도 않는다(설계서 01장 §2.3).
 */
export const canEditMilestones = (
  project?: Pick<ProjectDetailDto, 'managers'> | null,
  isAdmin?: boolean,
  myKnoxId?: string,
): boolean => !!isAdmin || (!!myKnoxId && !!project?.managers?.includes(myKnoxId));

/**
 * 과제 정보·부서·멤버·Manager 관리 권한 — **Admin만**(설계서 01장 §2.3, 가정 P1).
 * 과제 코드/Revision은 Admin에게도 disabled다(생성 후 수정 불가).
 */
export const canManageProject = (isAdmin?: boolean): boolean => !!isAdmin;

/**
 * 이 권한 한 벌에 내가 걸리는가 — 부서 또는 개인.
 * 부서 판정은 "내가 이 과제에서 속한 부서" 기준으로 실시간 계산한다.
 */
export function matchesGrant(
  grant: AccessGrant | null | undefined,
  myKnoxId: string | undefined,
  myDepts: string[],
): boolean {
  if (!grant) return false;
  if (myKnoxId && grant.users.includes(myKnoxId)) return true;
  return grant.departments.some((d) => myDepts.includes(d));
}

/**
 * workflow 소속 부서의 Edit Access 항목인가 — **삭제할 수 없는 고정 항목**이다.
 * Admin도 지울 수 없고, 오직 Department 변경으로만 교체된다(설계서 01장 §3.4).
 * 화면은 이 항목에 삭제 버튼을 그리지 않고 자물쇠 배지를 붙인다.
 */
export const isPinnedWorkflowDepartment = (
  workflow: Pick<WorkflowDto, 'department'> | null | undefined,
  department: string,
): boolean => !!workflow && workflow.department === department;
