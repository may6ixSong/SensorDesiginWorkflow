import { BlockDocument } from '../schemas/block.schema';
import { ArtifactDocument } from '../../artifacts/schemas/artifact.schema';
import { AccessLevel } from '../../common/access';
import { ArtifactDto, MaskedArtifactDto, toArtifactDto, toMaskedArtifactDto } from '../../artifacts/dto/artifact.dto';
import { isServiceGovernedTier } from '../../common/constants/tier';

/**
 * 캔버스 블록 하나의 공개 모양.
 *
 * ★ 캔버스는 Edit/View 권한자가 **완전히 동일한 화면**을 본다(설계서 03장 §1) — 그래서
 *   블록의 존재·좌표·flow는 누구에게나 같다. 다르게 보이는 것은 각 산출물의 **버전**뿐이고,
 *   그건 artifact 단위로 판정된다.
 * ★ 블록에는 **버전 라벨을 싣지 않는다.** 버전은 상세 slide에서만 보인다(설계서 03장 §2.1).
 *   대신 publish 3상태 배지를 그릴 수 있도록 publishState만 내려준다.
 */
export type PublishState = 'unpublished' | 'published' | 'newlyPublished';

export interface BlockDto {
  id: string;
  workflowId: string;
  phaseId: string;
  name: string;
  layout: { x: number; y: number; w: number; h: number };
  intent: 'own' | 'received';
  artifactId: string | null;
  /** 열람 권한이 없으면 masked 형태로만 온다. 미매핑이면 null. */
  artifact: ArtifactDto | MaskedArtifactDto | null;
  publishState: PublishState;
  /**
   * A Tier에서만 값이 있다. B/C/D의 recipient는 artifact.viewAccess에서 파생하므로
   * 여기가 아니라 artifact 쪽에 실린다(설계서 04장 §3).
   */
  recipients: {
    editAccess: { departments: string[]; users: string[] };
    viewAccess: { departments: string[]; users: string[] };
  } | null;
  series: string | null;
  seriesIdx: number;
  seriesTotal: number;
}

/**
 * publish 3상태 (설계서 03장 §2.2). 숫자(버전 라벨)는 쓰지 않는다.
 *   unpublished    — published 버전이 하나도 없다
 *   published      — 있고, 마지막 release 이후 major 변화가 없다
 *   newlyPublished — 있고, 마지막 release 이후 major가 올라갔다(= 다음 release 대상)
 */
export function publishStateOf(
  artifact: ArtifactDocument | null,
  lastReleasedMajorKey: string | null | undefined,
  majorKeyOf: (label: string | null | undefined) => string,
): PublishState {
  if (!artifact) return 'unpublished';
  const latest = (artifact.versions ?? []).find((v) => v.isPublished);
  if (!latest) return 'unpublished';
  if (lastReleasedMajorKey === undefined || lastReleasedMajorKey === null) return 'newlyPublished';
  return majorKeyOf(latest.versionLabel) === lastReleasedMajorKey ? 'published' : 'newlyPublished';
}

export function toBlockDto(
  block: BlockDocument,
  artifact: ArtifactDocument | null,
  artifactLevel: AccessLevel,
  publishState: PublishState,
): BlockDto {
  const isATier = artifact ? isServiceGovernedTier(artifact.tier) : false;

  return {
    id: block._id.toString(),
    workflowId: block.workflowId.toString(),
    phaseId: block.phaseId,
    name: artifact?.name ?? block.name,
    layout: { x: block.layout.x, y: block.layout.y, w: block.layout.w, h: block.layout.h },
    intent: block.intent,
    artifactId: block.artifactId?.toString() ?? null,
    artifact: !artifact
      ? null
      : artifactLevel === null
        ? toMaskedArtifactDto(artifact)
        : toArtifactDto(artifact, artifactLevel),
    // 열람 권한이 없으면 상태 자체가 정보이므로 배지를 그리지 않는다(설계서 03장 §2.2).
    publishState: artifactLevel === null ? 'unpublished' : publishState,
    recipients: isATier
      ? {
          editAccess: {
            departments: [...(block.recipients?.editAccess?.departments ?? [])],
            users: [...(block.recipients?.editAccess?.users ?? [])],
          },
          viewAccess: {
            departments: [...(block.recipients?.viewAccess?.departments ?? [])],
            users: [...(block.recipients?.viewAccess?.users ?? [])],
          },
        }
      : null,
    series: block.series?.toString() ?? null,
    seriesIdx: block.seriesIdx,
    seriesTotal: block.seriesTotal,
  };
}
