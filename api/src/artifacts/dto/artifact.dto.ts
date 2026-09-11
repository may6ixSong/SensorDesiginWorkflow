import { ArtifactDocument, ArtifactVersion } from '../schemas/artifact.schema';
import { AccessLevel } from '../../common/access';
import { isSirenGovernedTier } from '../../common/constants/tier';

/**
 * 산출물 응답 조립의 **단일 통로**다(설계서 01장 §5).
 *
 * FE가 숨기는 것으로는 부족하고, 권한 없는 값은 애초에 응답에서 빠져야 한다. 그래서
 * artifact를 클라이언트로 내보내는 모든 경로가 반드시 이 함수를 거친다 — 새 라우트를
 * 추가할 때도 여기를 통하지 않고 document를 그대로 반환하면 안 된다.
 */

/** 버전 하나의 공개 모양. */
export interface ArtifactVersionDto {
  tier: string;
  versionLabel: string;
  isPublished: boolean;
  versionRef: string | null;
  giverKnoxId: string | null;
  giverDept: string | null;
  viewUrl: string | null;
  hpcPath: string | null;
  note: string;
  sourceRefs: unknown[];
  publishedAt: Date | null;
  observedAt: Date | null;
  createdAt: Date;
}

export interface ArtifactDto {
  id: string;
  projectId: string;
  name: string;
  tier: string;
  network: string;
  serviceKey: string | null;
  externalArtifactId: string | null;
  artifactTypeKey: string | null;
  externalUrl: string | null;
  /** 이 호출자의 실효 권한. FE의 UX 게이트용이며, 실제 차단은 서버가 이미 끝냈다. */
  myAccess: AccessLevel;
  /**
   * B/C/D만 값이 있다. A는 그 서비스가 권한을 판정하므로 항상 비어 있다
   * (설계서 04장 §3) — 값이 저장돼 있더라도 여기서 비운다.
   */
  editAccess: { departments: string[]; users: string[] } | null;
  viewAccess: { departments: string[]; users: string[] } | null;
  /**
   * 화면이 tier별 분기를 하지 않도록, B/C/D는 viewAccess를 그대로 recipient로 채워
   * 내려준다. 단 **편집은 viewAccess를 통해서만** 한다 — 단일 진실은 viewAccess다.
   * A Tier의 recipient는 artifact가 아니라 block에 있으므로 여기서는 항상 null이다.
   */
  recipients: { departments: string[]; users: string[] } | null;
  versions: ArtifactVersionDto[];
  createdBy: string;
}

export function toVersionDto(v: ArtifactVersion): ArtifactVersionDto {
  return {
    tier: v.tier,
    versionLabel: v.versionLabel,
    isPublished: v.isPublished,
    versionRef: v.versionRef ?? null,
    giverKnoxId: v.giverKnoxId ?? null,
    giverDept: v.giverDept ?? null,
    viewUrl: v.viewUrl ?? null,
    hpcPath: v.hpcPath ?? null,
    note: v.note ?? '',
    sourceRefs: v.sourceRefs ?? [],
    publishedAt: v.publishedAt ?? null,
    observedAt: v.observedAt ?? null,
    createdAt: v.createdAt,
  };
}

/**
 * 버전 가시성(설계서 04장 §7):
 *   - giver(= 그 산출물의 Edit 권한자) → 전체 (미발행 working 포함)
 *   - 그 외 전원 (recipient 포함)      → isPublished: true 인 것만
 *
 * A Tier의 giver 여부는 SIREN이 알 수 없으므로 호출부가 그 서비스의 `access.canEdit`를
 * 그대로 level로 넘겨준다(ArtifactAccessService). 즉 A Tier에서는 recipient에 edit으로
 * 들어 있어도 그 서비스에서 edit 권한이 없으면 working 버전이 보이지 않는다.
 */
/** 버전 배열 → 권한에 맞춰 거른 DTO 목록. DB에서 읽은 것이든 라이브 조회 결과든 공용이다. */
export function toVersionDtoList(versions: ArtifactVersion[], level: AccessLevel): ArtifactVersionDto[] {
  const all = versions.map(toVersionDto);
  if (level === 'edit') return all;
  return all.filter((v) => v.isPublished);
}

export function visibleVersions(artifact: ArtifactDocument, level: AccessLevel): ArtifactVersionDto[] {
  return toVersionDtoList(artifact.versions ?? [], level);
}

export function toArtifactDto(artifact: ArtifactDocument, level: AccessLevel): ArtifactDto {
  const sirenGoverned = isSirenGovernedTier(artifact.tier);
  const view = sirenGoverned
    ? {
        departments: [...(artifact.viewAccess?.departments ?? [])],
        users: [...(artifact.viewAccess?.users ?? [])],
      }
    : null;

  return {
    id: artifact._id.toString(),
    projectId: artifact.projectId.toString(),
    name: artifact.name,
    tier: artifact.tier,
    network: artifact.network,
    serviceKey: artifact.serviceKey ?? null,
    externalArtifactId: artifact.externalArtifactId ?? null,
    artifactTypeKey: artifact.artifactTypeKey ?? null,
    externalUrl: artifact.externalUrl ?? null,
    myAccess: level,
    editAccess: sirenGoverned
      ? {
          departments: [...(artifact.editAccess?.departments ?? [])],
          users: [...(artifact.editAccess?.users ?? [])],
        }
      : null,
    viewAccess: view,
    // B/C/D는 view가 곧 recipient. A는 block에 있으므로 null.
    recipients: view ? { departments: [...view.departments], users: [...view.users] } : null,
    versions: visibleVersions(artifact, level),
    createdBy: artifact.createdBy,
  };
}

/**
 * 열람 권한이 전혀 없는 산출물을 목록에 실을 때 쓰는 최소 표현.
 * 캔버스는 블록의 **존재**를 그려야 하지만, 버전 라벨·링크·경로는 응답에서 빠져야 한다.
 */
export interface MaskedArtifactDto {
  id: string;
  name: string;
  tier: string;
  network: string;
  myAccess: null;
  masked: true;
}

export function toMaskedArtifactDto(artifact: ArtifactDocument): MaskedArtifactDto {
  return {
    id: artifact._id.toString(),
    name: artifact.name,
    tier: artifact.tier,
    network: artifact.network,
    myAccess: null,
    masked: true,
  };
}
