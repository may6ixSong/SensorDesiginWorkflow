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
   * 필수(사용자 요청) — 'OA' 또는 'HPC' 둘 중 하나. 파일 업로드는 어느 쪽이든 항상
   * 가능하고, 이 값은 그 artifact의 버전들이 링크(OA)/경로(HPC) 중 어느 배열을 쓸지만
   * 정한다. 언제든 admin/editor가 나중에 바꿀 수 있다(`setNetwork`).
   */
  @IsIn(['OA', 'HPC'])
  network: 'OA' | 'HPC';

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

/**
 * PATCH /artifacts/:id/network 몸체 — 'OA' 또는 'HPC'. 언제든 admin/editor가 바꿀 수
 * 있게 열어 달라는 사용자 요청에 따라 이 라우트를 열었다 — 이미 있는 버전들의
 * 콘텐츠(files/links/paths)는 그대로 두고, 이후 새 버전이 쓸 배열(links vs paths)만
 * 바뀐다.
 */
export class SetNetworkDto {
  @IsIn(['OA', 'HPC'])
  network: 'OA' | 'HPC';
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

  /**
   * 파일 업로드와 같은 multipart 요청 안에 실려 오므로 JSON 문자열로 받는다 —
   * `JSON.stringify({url, label}[])`. network==='OA'인 artifact에만 쓴다.
   */
  @IsOptional()
  @IsString()
  linksJson?: string;

  /** 위와 같은 이유로 JSON 문자열 — `JSON.stringify({path, label}[])`. network==='HPC'인 artifact에만 쓴다. */
  @IsOptional()
  @IsString()
  pathsJson?: string;
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
    links: (v.links ?? []).map((l) => ({ url: l.url, label: l.label ?? '' })),
    paths: (v.paths ?? []).map((p) => ({ path: p.path, label: p.label ?? '' })),
    versionNote: v.versionNote ?? '',
    description: v.description ?? '',
    createdBy: v.createdBy,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
  };
}

/**
 * AddVersionDto.linksJson/pathsJson을 파싱한다 — multipart 필드라 JSON 문자열로 온다.
 * 형식이 어긋나면(빈 문자열, 깨진 JSON, url/path가 빈 항목) 그냥 걸러낸다 — 여기서
 * 400을 던지기보다는 "실수로 이상한 값이 섞였을 뿐 안전하게 무시해도 되는" 쪽으로
 * 관대하게 처리한다.
 */
function parseLocationEntries(json: string | undefined, key: 'url' | 'path'): Record<string, string>[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: Record<string, string>[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const value = String((entry as Record<string, unknown>)[key] ?? '').trim();
    if (!value) continue;
    const label = String((entry as Record<string, unknown>).label ?? '').trim();
    out.push({ [key]: value, label });
  }
  return out;
}

export function parseLinksJson(json: string | undefined): { url: string; label: string }[] {
  return parseLocationEntries(json, 'url') as { url: string; label: string }[];
}

export function parsePathsJson(json: string | undefined): { path: string; label: string }[] {
  return parseLocationEntries(json, 'path') as { path: string; label: string }[];
}
