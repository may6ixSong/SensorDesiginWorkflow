import { ProjectDocument, PhaseRef } from '../schemas/project.schema';
import { UserDocument } from '../../users/schemas/user.schema';
import { toUserDto, UserDto } from '../../users/dto/user.dto';

export interface ProjectMemberDto {
  user: UserDto;
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

/** project.members.userId가 populate된 문서를 받는다고 가정 (설계서 4.4, IpDto.viewGrants와 동일 패턴). */
export function toProjectDetailDto(project: ProjectDocument): ProjectDetailDto {
  return {
    _id: project._id.toString(),
    code: project.code,
    name: project.name,
    domain: project.domain,
    status: project.status,
    phases: project.phases,
    members: (project.members as any[])
      .filter((m) => m.userId)
      .map((m) => ({
        user: toUserDto(m.userId as UserDocument),
        department: m.department,
        addedAt: m.addedAt,
      })),
  };
}
