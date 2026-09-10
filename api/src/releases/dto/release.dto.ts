import { ReleaseDocument } from '../schemas/release.schema';

/**
 * release 응답 조립 통로.
 *
 * ★ 마스킹은 **저장 시점이 아니라 열람 시점 기준**으로 매번 재판정한다 — release 문서에
 *   권한을 얼려두지 않았으므로, 과거 release를 열 때도 "지금 이 사람의 권한"으로 무엇을
 *   보여줄지 정한다(설계서 05장 §5).
 * @param visibleArtifactIds 지금 이 사람이 열람 권한을 가진 artifact id 집합.
 *   여기에 없는 항목은 버전 라벨·링크·경로를 비운다.
 */
export function toReleaseDto(release: ReleaseDocument, visibleArtifactIds: Set<string>) {
  return {
    id: release._id.toString(),
    projectId: release.projectId.toString(),
    workflowId: release.workflowId.toString(),
    seq: release.seq,
    /** 화면 표기는 항상 `v{seq}` — 단일 정수 시퀀스다(major.minor가 아니다). */
    label: `v${release.seq}`,
    releasedAt: release.releasedAt,
    releasedBy: release.releasedBy,
    note: release.note,
    workflowAt: release.workflowAt,
    recipientDepartments: [...(release.recipientDepartments ?? [])],
    items: (release.items ?? []).map((item) => {
      const visible = visibleArtifactIds.has(item.artifactId);
      return {
        blockId: item.blockId,
        artifactId: item.artifactId,
        artifactName: item.artifactName,
        tier: item.tier,
        network: item.network,
        phaseId: item.phaseId,
        phaseName: item.phaseName,
        changed: item.changed,
        firstTime: item.firstTime,
        lookupFailed: item.lookupFailed,
        recipients: item.recipients,
        masked: !visible,
        published: visible ? item.published : null,
        sources: (item.sources ?? []).map((s) => ({
          blockId: s.blockId,
          artifactId: s.artifactId,
          artifactName: s.artifactName,
          selected: visible ? s.selected : null,
        })),
      };
    }),
  };
}
