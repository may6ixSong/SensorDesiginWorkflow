import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ArtifactDocument, ArtifactVersion } from '../schemas/artifact.schema';

/**
 * 등록 시 **project + department만** 받는다 - workflow는 받지 않는다.
 * Calypso는 workflow 개념을 모르고, 어느 workflow가 이걸 쓸지는 SIREN 쪽에서
 * 고르는 일이다 (Hub 설계서 §11.4).
 */
export class CreateArtifactDto {
  @IsString()
  @MinLength(1)
  projectId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  department: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class ListArtifactsQuery {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  department?: string;

  /** 'true'면 내가 등록한 것만 - My Task 필터 (Hub 설계서 §14.3). */
  @IsOptional()
  @IsString()
  mine?: string;
}

export class AddVersionDto {
  @IsOptional()
  @IsString()
  note?: string;

  /** SIREN 공용 데이터에서 고른 내 부서. giver.dept로 그대로 전달된다. */
  @IsOptional()
  @IsString()
  dept?: string;
}

export class ReleaseDto {
  @IsOptional()
  @IsString()
  note?: string;
}

/** 화면용 - Observer 계약(VersionRecord)과는 별개다. 이쪽은 파일명·스토리지 키까지 보여준다. */
export function toArtifactDto(a: ArtifactDocument, actor: { knoxId: string }) {
  const latest = a.versions[0] ?? null;
  const released = a.versions.find((v) => v.isReleased) ?? null;
  return {
    id: a._id.toString(),
    projectId: a.projectId,
    department: a.department,
    name: a.name,
    description: a.description ?? '',
    createdBy: a.createdBy,
    canEdit: a.createdBy === actor.knoxId,
    versionCount: a.versions.length,
    latestVersion: latest ? toVersionView(latest) : null,
    releasedVersion: released ? toVersionView(released) : null,
  };
}

export function toVersionView(v: ArtifactVersion) {
  return {
    versionLabel: `${v.major}.${v.minor}`,
    isReleased: v.isReleased === true,
    versionRef: v.versionRef,
    fileName: v.fileName,
    note: v.note ?? '',
    createdBy: v.createdBy,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
  };
}
