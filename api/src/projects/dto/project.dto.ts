import { ProjectDocument, Milestone } from '../schemas/project.schema';
import { sortSchedule } from '../../common/schedule';

export interface ProjectMemberDto {
  /** KnoxID - 이름/부서/아바타는 web이 공통 플랫폼에서 조회한다. */
  knoxId: string;
  department: string;
  addedAt: Date;
}

export interface MilestoneDto {
  id: string;
  name: string;
  start: string;
  end: string;
}

export interface ProjectDetailDto {
  _id: string;
  code: string;
  name: string;
  /** 이 과제의 workflow가 고를 수 있는 설계 도메인 목록. */
  workflowDomains: string[];
  status: string;
  /** 과제 공통 일정 — 항상 start 오름차순. workflow phase의 초기값이기도 하다. */
  milestones: MilestoneDto[];
  members: ProjectMemberDto[];
  /** 마일스톤을 수정할 수 있는 Project Manager의 knoxId 목록 (Workflow.owners와는 별개 role). */
  managers: string[];
}

export function toMilestoneDto(m: Milestone): MilestoneDto {
  return { id: m.id, name: m.name, start: m.start, end: m.end };
}

export function toProjectDetailDto(project: ProjectDocument): ProjectDetailDto {
  return {
    _id: project._id.toString(),
    code: project.code,
    name: project.name,
    workflowDomains: [...(project.workflowDomains ?? [])],
    status: project.status,
    milestones: sortSchedule(project.milestones ?? []).map(toMilestoneDto),
    members: project.members.map((m) => ({
      knoxId: m.knoxId,
      department: m.department,
      addedAt: m.addedAt,
    })),
    managers: [...(project.managers ?? [])],
  };
}
