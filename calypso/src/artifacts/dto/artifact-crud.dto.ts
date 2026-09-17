import {
  IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateIf,
} from 'class-validator';
import { ArtifactDocument, ArtifactGrant, ArtifactVersion } from '../schemas/artifact.schema';
import { AccessLevel } from '../artifacts.service';

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

  /**
   * 생략하면 null(File — 실물을 이 서비스가 들고 있다). 'OA'/'HPC'면 실물이 없고
   * 각 버전의 viewUrl/hpcPath가 위치만 가리킨다(§3.9). 등록 후에는 바뀌지 않는다.
   */
  @IsOptional()
  @IsIn(['OA', 'HPC'])
  network?: 'OA' | 'HPC';

  /** 생략하면 false(view 기본 개방) — 사용자 요청. */
  @IsOptional()
  @IsBoolean()
  restrictView?: boolean;
}

/** PATCH /artifacts/:id/restrict-view 몸체. */
export class SetRestrictViewDto {
  @IsBoolean()
  restrictView: boolean;
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
  /** 짧은 한 줄 메모 — 필수(사용자 요청). */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  versionNote: string;

  /** 서식 있는(HTML) 긴 설명 — 선택. */
  @IsOptional()
  @IsString()
  description?: string;

  /** SIREN 공용 데이터에서 고른 내 부서. giver.dept로 그대로 전달된다. */
  @IsOptional()
  @IsString()
  dept?: string;

  /** network==='OA'인 artifact에만. */
  @IsOptional()
  @IsString()
  viewUrl?: string;

  /** network==='HPC'인 artifact에만. */
  @IsOptional()
  @IsString()
  hpcPath?: string;
}

export class ReleaseDto {
  /** 짧은 한 줄 메모 — 필수(사용자 요청, 새 버전 추가와 동일한 규칙). */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  versionNote: string;

  /** 서식 있는(HTML) 긴 설명 — 선택. */
  @IsOptional()
  @IsString()
  description?: string;

  /**
   * 어느 minor를 승격할지 — 비우면 지금까지처럼 최신 minor를 쓴다. Calypso는 minor를
   * 여러 개 쌓아둘 수 있어서(사용자 요청), version tree에서 released 아닌 과거 minor를
   * 골라 그 데이터로 바로 release할 수 있어야 한다.
   */
  @IsOptional()
  @IsString()
  sourceVersionRef?: string;
}

/** editors/viewGrants에 한 건 추가·삭제할 때 쓰는 몸체 — user 또는 department 중 하나. */
export class GrantDto {
  @IsIn(['user', 'department'])
  type: 'user' | 'department';

  @ValidateIf((o: GrantDto) => o.type === 'user')
  @IsString()
  @MinLength(1)
  knoxId?: string;

  @ValidateIf((o: GrantDto) => o.type === 'department')
  @IsString()
  @MinLength(1)
  department?: string;
}

function toGrantView(g: ArtifactGrant) {
  return {
    type: g.type,
    knoxId: g.knoxId,
    department: g.department,
    grantedBy: g.grantedBy,
    grantedAt: g.grantedAt instanceof Date ? g.grantedAt.toISOString() : String(g.grantedAt),
  };
}

/**
 * 화면용 - Observer 계약(VersionRecord)과는 별개다. 이쪽은 파일명·스토리지 키까지 보여준다.
 *
 * access==='view'면 released 버전만 보인다 — working(unreleased)은 마스킹한다(사용자
 * 요청: "권한에 따라 version과 data노출이 달라지게"). access는 호출부(controller)가
 * computeAccess()로 미리 계산해 넘긴다 — 여기서 다시 actor를 몰라도 되게.
 */
export function toArtifactDto(a: ArtifactDocument, access: Exclude<AccessLevel, 'none'>) {
  const visible = access === 'edit' ? a.versions : a.versions.filter((v) => v.isReleased);
  const latest = visible[0] ?? null;
  const released = visible.find((v) => v.isReleased) ?? null;
  return {
    id: a._id.toString(),
    projectId: a.projectId,
    department: a.department,
    name: a.name,
    description: a.description ?? '',
    network: a.network,
    createdBy: a.createdBy,
    myAccess: access,
    versionCount: visible.length,
    latestVersion: latest ? toVersionView(latest) : null,
    releasedVersion: released ? toVersionView(released) : null,
    editors: a.editors.map(toGrantView),
    viewGrants: a.viewGrants.map(toGrantView),
    restrictView: a.restrictView === true,
  };
}

export function toVersionView(v: ArtifactVersion) {
  return {
    versionLabel: `${v.major}.${v.minor}`,
    isReleased: v.isReleased === true,
    versionRef: v.versionRef,
    files: (v.files ?? []).map((f) => ({ fileName: f.fileName, storageKey: f.storageKey })),
    viewUrl: v.viewUrl ?? null,
    hpcPath: v.hpcPath ?? null,
    versionNote: v.versionNote ?? '',
    description: v.description ?? '',
    createdBy: v.createdBy,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
  };
}
