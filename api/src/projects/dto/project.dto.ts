import { ProjectDocument, Milestone } from '../schemas/project.schema';
import { sortSchedule } from '../../common/schedule';

export interface DepartmentDto {
  id: string;
  name: string;
}

export interface ProjectMemberDto {
  /** KnoxID - 이름/부서/아바타는 web이 공통 플랫폼에서 조회한다. */
  knoxId: string;
  /** 이 멤버가 속한 부서(팀) id 목록 — 한 멤버가 여러 부서에 동시에 속할 수 있다(02장 §9.2). */
  departments: string[];
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
  /** 같은 code라도 다른 프로젝트로 취급하는 리비전. 없으면 빈 문자열(Hub 설계서 §19). */
  revision: string;
  name: string;
  /**
   * 산출물 "Received from" 후보 부서 목록 — 과제마다 자유롭게 추가/개명/삭제한다
   * (`POST`/`PATCH`/`DELETE /projects/:id/departments`, 02장 §9.1). 새 과제는 기본
   * 6개(Analog/Digital/APS/PI-PD/Solution/PTE)로 시작한다(ProjectsService.ensureDepartments).
   * ★개명★ 이제 id도 함께 내려간다(구 string[]) — workflow.department 등 모든 부서
   * 참조 필드가 이 id를 저장하고, 화면은 이 배열에서 id→name을 찾아 보여준다(02장 §9.3).
   */
  departments: DepartmentDto[];
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
    revision: project.revision ?? '',
    name: project.name,
    departments: (project.departments ?? []).map((d) => ({ id: d.id, name: d.name })),
    status: project.status,
    milestones: sortSchedule(project.milestones ?? []).map(toMilestoneDto),
    members: project.members.map((m) => ({
      knoxId: m.knoxId,
      departments: [...(m.departments ?? [])],
      addedAt: m.addedAt,
    })),
    managers: [...(project.managers ?? [])],
  };
}
