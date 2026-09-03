import { ArtifactDocument, ArtifactVersion } from './schemas/artifact.schema';

/** 이 서비스가 구현한 Observer 계약 버전. 응답 헤더 X-Observer-Contract로도 나간다. */
export const CONTRACT_VERSION = '1.0';

/**
 * Observer 계약의 VersionRecord (docs/observer-contract-v1.yaml).
 *
 * ★ 화면용 DTO(toArtifactDto)와 일부러 분리해 둔다. 화면은 파일명·스토리지 키까지
 *   보여주지만, SIREN에는 **참조에 필요한 것만** 준다 - 실물 파일은 여기 남고 SIREN은
 *   viewUrl로 사람을 이쪽으로 보낼 뿐이다(Hub 설계서 §1.2).
 */
export function toVersionRecord(a: ArtifactDocument, v: ArtifactVersion, publicBaseUrl: string) {
  return {
    artifactId: a._id.toString(),
    versionRef: v.versionRef,
    versionLabel: `${v.major}.${v.minor}`,
    isReleased: v.isReleased === true,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
    giver: {
      knoxId: v.createdBy ?? null,
      dept: v.createdByDept ?? a.department ?? null,
    },
    // 파일 업로드형 산출물은 다른 산출물로부터 파생되지 않는다 - 빈 배열이 정상이다.
    // (계약상 선택 필드다 - Hub 설계서 §17.1)
    sourceRefs: [] as unknown[],
    viewUrl: `${publicBaseUrl.replace(/\/$/, '')}/artifacts/${a._id.toString()}`,
  };
}

export function toArtifactSummary(a: ArtifactDocument, publicBaseUrl: string) {
  const latest = a.versions[0] ?? null;
  return {
    artifactId: a._id.toString(),
    name: a.name,
    projectId: a.projectId,
    department: a.department ?? null,
    currentVersion: latest ? toVersionRecord(a, latest, publicBaseUrl) : null,
  };
}
