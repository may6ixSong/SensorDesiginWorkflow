import { Injectable } from '@nestjs/common';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { BlockDocument } from './schemas/block.schema';
import { ArtifactDocument } from '../artifacts/schemas/artifact.schema';
import { BlocksService } from './blocks.service';
import { ArtifactsService, majorKeyOf } from '../artifacts/artifacts.service';
import { ArtifactAccessService } from '../artifacts/artifact-access.service';
import { ReleasesService } from '../releases/releases.service';
import { Actor } from '../common/actor';
import { BlockDto, publishStateOf, toBlockDto } from './dto/block.dto';

/**
 * 캔버스 응답을 조립한다 — 블록 + 각 산출물의 권한 판정 + publish 배지 상태.
 *
 * ★ 여기서 외부 서비스를 호출하는 경우는 **A Tier 산출물의 권한 게이트뿐**이다. 버전을
 *   물어보지는 않는다 — 평소 캔버스 렌더링은 라이브 버전 조회를 하지 않는 것이 원칙이고
 *   (설계서 05장 §8), 그래야 서비스 하나가 느려도 캔버스가 멈추지 않는다.
 * ★ 산출물 권한은 **하나하나마다** 판정된다. 같은 캔버스 안에서 어떤 노드는 열리고 어떤
 *   노드는 막힌 상태가 동시에 존재한다(설계서 04장 §7).
 */
@Injectable()
export class CanvasViewService {
  constructor(
    private readonly blocks: BlocksService,
    private readonly artifacts: ArtifactsService,
    private readonly artifactAccess: ArtifactAccessService,
    private readonly releases: ReleasesService,
  ) {}

  async assemble(
    workflow: WorkflowDocument,
    project: ProjectDocument | null,
    actor: Actor,
  ): Promise<BlockDto[]> {
    const blocks = await this.blocks.listForWorkflow(workflow._id);
    const artifactMap = await this.artifacts.findMany(
      blocks.map((b) => b.artifactId).filter(Boolean) as any[],
    );

    // publish 배지의 기준점 — 마지막 release가 그 산출물을 어떤 major로 실어 보냈는가.
    const lastRelease = await this.releases.previous(workflow._id);
    const lastMajorByArtifact = new Map<string, string | null>(
      (lastRelease?.items ?? []).map((i) => [i.artifactId, i.published?.majorKey ?? null]),
    );

    return Promise.all(
      blocks.map(async (block) => {
        const artifact = block.artifactId
          ? (artifactMap.get(block.artifactId.toString()) ?? null)
          : null;

        const level = artifact
          ? await this.artifactAccess.levelFor(actor, artifact, block, project)
          : null;

        return toBlockDto(
          block,
          artifact,
          level,
          this.publishState(artifact, lastMajorByArtifact, lastRelease !== null),
        );
      }),
    );
  }

  private publishState(
    artifact: ArtifactDocument | null,
    lastMajorByArtifact: Map<string, string | null>,
    hasAnyRelease: boolean,
  ) {
    if (!artifact) return 'unpublished' as const;
    const id = artifact._id.toString();
    // 아직 release가 한 번도 없었거나 이 산출물이 실린 적이 없다면, publish된 것이 있으면
    // 전부 "신규 발행"이다 — 다음 release에서 highlight될 대상이라는 뜻이다.
    const lastMajor = hasAnyRelease && lastMajorByArtifact.has(id) ? lastMajorByArtifact.get(id)! : null;
    return publishStateOf(artifact, lastMajor, majorKeyOf);
  }

  /**
   * A Tier의 라이브 버전 조회(설계서 04장 §19.5/§19.6 복원). 평소 캔버스 조립(assemble)은
   * 원칙대로 라이브 버전을 절대 묻지 않는다 — 이건 slide를 실제로 열었을 때만, 그 block
   * 하나에 대해서만 호출되는 별도 경로다.
   *
   * 게이트 1(recipient)을 판정할 근거인 block 맥락이 필요해서 artifact 단독 라우트가
   * 아니라 여기(block 경유)에 둔다 — ArtifactAccessService.assertCanOpen이 이미 하는
   * 두 게이트 판정을 그대로 재사용한다.
   */
  async liveVersions(blockId: string, project: ProjectDocument | null, actor: Actor) {
    const block = await this.blocks.findOrThrow(blockId);
    const artifact = block.artifactId
      ? await this.artifacts.findOrThrow(block.artifactId.toString())
      : null;
    if (!artifact) return [];
    const level = await this.artifactAccess.assertCanOpen(actor, artifact, block, project);
    return this.artifactAccess.liveVersions(actor, artifact, level);
  }

  /** 블록 하나만 다시 조립한다 — 생성/수정 응답용. */
  async assembleOne(
    block: BlockDocument,
    workflow: WorkflowDocument,
    project: ProjectDocument | null,
    actor: Actor,
  ): Promise<BlockDto> {
    const artifact = block.artifactId
      ? await this.artifacts.findOrThrow(block.artifactId.toString())
      : null;
    const level = artifact
      ? await this.artifactAccess.levelFor(actor, artifact, block, project)
      : null;
    const lastRelease = await this.releases.previous(workflow._id);
    const lastMajorByArtifact = new Map<string, string | null>(
      (lastRelease?.items ?? []).map((i) => [i.artifactId, i.published?.majorKey ?? null]),
    );
    return toBlockDto(block, artifact, level, this.publishState(artifact, lastMajorByArtifact, lastRelease !== null));
  }
}
