import { ProjectDocument, PhaseRef } from '../schemas/project.schema';

export interface ProjectMemberDto {
  /** KnoxID - 이름/부서/아바타는 web이 공통 플랫폼에서 조회한다. */
  knoxId: string;
  department: string;
  addedAt: Date;
}

export interface ProjectDetailDto {
  _id: string;
  code: string;
  name: string;
  domain: string;
  status: string;
  phases: PhaseRef[];
  members: ProjectMemberDto[];
}

export function toProjectDetailDto(project: ProjectDocument): ProjectDetailDto {
  return {
    _id: project._id.toString(),
    code: project.code,
    name: project.name,
    domain: project.domain,
    status: project.status,
    phases: project.phases,
    members: project.members.map((m) => ({
      knoxId: m.knoxId,
      department: m.department,
      addedAt: m.addedAt,
    })),
  };
}
