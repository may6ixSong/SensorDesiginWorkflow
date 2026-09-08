import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ProjectServiceLinkDocument } from '../schemas/project-service-link.schema';

/** §19.3 — 후보 중 사람이 확정한 externalProjectId를 그대로 링크로 남긴다. */
export class CreateProjectLinkDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  serviceKey: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  externalProjectId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;
}

export interface ProjectLinkDto {
  _id: string;
  projectId: string;
  serviceKey: string;
  externalProjectId: string;
  displayName: string;
  linkedBy: string;
  createdAt: Date;
}

export function toProjectLinkDto(link: ProjectServiceLinkDocument): ProjectLinkDto {
  return {
    _id: link._id.toString(),
    projectId: link.projectId.toString(),
    serviceKey: link.serviceKey,
    externalProjectId: link.externalProjectId,
    displayName: link.displayName ?? '',
    linkedBy: link.linkedBy,
    createdAt: (link as any).createdAt,
  };
}
