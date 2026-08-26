import { WorkflowDocument, WorkflowPhase } from '../schemas/workflow.schema';
import { Actor } from '../../common/actor';
import { sortSchedule } from '../../common/schedule';

export interface WorkflowPhaseDto {
  id: string;
  name: string;
  start: string;
  end: string;
}

export interface WorkflowDto {
  id: string;
  projectId: string;
  /** workflow가 속한 설계 도메인. 권한과 무관하게 view 권한자에게도 그대로 보인다. */
  domain: string;
  name: string;
  description: string;
  color: string;
  /** 이 workflow만의 일정 — 항상 start 오름차순으로 정렬해서 내려간다. */
  phases: WorkflowPhaseDto[];
  /** KnoxID 목록 - 이름/부서/아바타는 web이 공통 플랫폼에서 조회한다. */
  owners: string[];
  viewGrants: { knoxId: string; department: string; grantedAt: Date }[];
  myAccess: 'edit' | 'view';
}

export function toPhaseDto(p: WorkflowPhase): WorkflowPhaseDto {
  return { id: p.id, name: p.name, start: p.start, end: p.end };
}

/**
 * 설계서 5.1 - "권한별 필드 마스킹은 6.1 참조": 현재 접근 가능한 사용자(edit 또는 view)라면
 * owners/viewGrants 목록 자체는 동일하게 노출한다 (담당자 chip 표시, 권한 dialog에 필요).
 */
export function toWorkflowDto(workflow: WorkflowDocument, me: Actor): WorkflowDto {
  return {
    id: workflow._id.toString(),
    projectId: workflow.projectId.toString(),
    domain: workflow.domain,
    name: workflow.name,
    description: workflow.description,
    color: workflow.color,
    phases: sortSchedule(workflow.phases ?? []).map(toPhaseDto),
    owners: [...workflow.owners],
    viewGrants: workflow.viewGrants.map((g) => ({
      knoxId: g.knoxId,
      department: g.department,
      grantedAt: g.grantedAt,
    })),
    myAccess: workflow.owners.includes(me.knoxId) ? 'edit' : 'view',
  };
}
