import { Injectable } from '@nestjs/common';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { WorkflowNodeDocument } from './schemas/node.schema';
import { ArtifactDocument } from '../artifacts/schemas/artifact.schema';
import { NodesService } from './nodes.service';
import { ArtifactsService, majorKeyOf } from '../artifacts/artifacts.service';
import { ArtifactAccessService } from '../artifacts/artifact-access.service';
import { ReleasesService } from '../releases/releases.service';
import { Actor } from '../common/actor';
import { workflowLevel } from '../common/access';
import { NodeDto, publishStateOf, toNodeDto } from './dto/node.dto';

/**
 * 캔버스 응답을 조립한다 — 노드 + 각 산출물의 권한 판정 + publish 배지 상태.
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
    private readonly nodes: NodesService,
    private readonly artifacts: ArtifactsService,
    private readonly artifactAccess: ArtifactAccessService,
    private readonly releases: ReleasesService,
  ) {}

  async assemble(
    workflow: WorkflowDocument,
    project: ProjectDocument | null,
    actor: Actor,
  ): Promise<NodeDto[]> {
    const nodes = await this.nodes.listForWorkflow(workflow._id);
    const artifactMap = await this.artifacts.findMany(
      nodes.map((n) => n.artifactId).filter(Boolean) as any[],
    );

    // publish 배지의 기준점 — 그 산출물이 담겼던 **가장 최근 release**가 어떤 major로
    // 실어 보냈는가. 부서 타겟팅 이후로는 "가장 최근 release 한 건"이 아니라 산출물별로
    // 따로 찾아야 한다(ReleasesService.baselineFor 참고) — 최신 release가 다른 부서를
    // 겨냥했다면 이 산출물을 담지 않았을 수 있어서다.
    const baseline = await this.releases.baselineFor(workflow._id);
    const lastMajorByArtifact = new Map<string, string | null>(
      [...baseline].map(([artifactId, item]) => [artifactId, item.published?.majorKey ?? null]),
    );
    const hasAnyRelease = await this.releases.hasAnyRelease(workflow._id);

    // Recipients/Comments 탭 노출 여부의 기준(설계서 01장 §3.8 확장) — workflow 전체에 대해
    // 한 번만 판정하면 된다. node마다 다르지 않다.
    const canManageNodes = workflowLevel(actor, workflow, project) === 'edit';

    return Promise.all(
      nodes.map(async (node) => {
        const artifact = node.artifactId
          ? (artifactMap.get(node.artifactId.toString()) ?? null)
          : null;

        const level = artifact
          ? await this.artifactAccess.levelFor(actor, artifact, project)
          : null;

        return toNodeDto(
          node,
          artifact,
          level,
          this.publishState(artifact, lastMajorByArtifact, hasAnyRelease),
          canManageNodes,
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
   * 원칙대로 라이브 버전을 절대 묻지 않는다 — 이건 slide를 실제로 열었을 때만, 그 node
   * 하나에 대해서만 호출되는 별도 경로다.
   *
   * artifact 단독 라우트가 아니라 node 경유로 두는 건 artifactId를 node에서 꺼내야
   * 해서일 뿐이다 — 권한 판정 자체(ArtifactAccessService.assertCanOpen)는 이제 node
   * 맥락이 필요 없다(설계서 01장 §4.2 갱신).
   */
  async liveVersions(nodeId: string, project: ProjectDocument | null, actor: Actor) {
    const node = await this.nodes.findOrThrow(nodeId);
    const artifact = node.artifactId
      ? await this.artifacts.findOrThrow(node.artifactId.toString())
      : null;
    if (!artifact) return [];
    const level = await this.artifactAccess.assertCanOpen(actor, artifact, project);
    return this.artifactAccess.liveVersions(actor, artifact, level);
  }

  /**
   * html preview 하나(설계서 04장 §19 확장) — slide가 열려 있는 동안, 지금 보고 있는(또는
   * 방금 고른) 버전 하나에 대해서만 호출된다. liveVersions와 같은 이유로 캔버스 조립에는
   * 절대 섞이지 않는다.
   */
  async htmlView(nodeId: string, versionLabel: string, project: ProjectDocument | null, actor: Actor) {
    const node = await this.nodes.findOrThrow(nodeId);
    const artifact = node.artifactId
      ? await this.artifacts.findOrThrow(node.artifactId.toString())
      : null;
    if (!artifact) return null;
    const level = await this.artifactAccess.assertCanOpen(actor, artifact, project);
    return this.artifactAccess.htmlView(actor, artifact, level, versionLabel);
  }

  /** 노드 하나만 다시 조립한다 — 생성/수정 응답용. */
  async assembleOne(
    node: WorkflowNodeDocument,
    workflow: WorkflowDocument,
    project: ProjectDocument | null,
    actor: Actor,
  ): Promise<NodeDto> {
    const artifact = node.artifactId
      ? await this.artifacts.findOrThrow(node.artifactId.toString())
      : null;
    const level = artifact
      ? await this.artifactAccess.levelFor(actor, artifact, project)
      : null;
    const baseline = await this.releases.baselineFor(workflow._id);
    const lastMajorByArtifact = new Map<string, string | null>(
      [...baseline].map(([artifactId, item]) => [artifactId, item.published?.majorKey ?? null]),
    );
    const hasAnyRelease = await this.releases.hasAnyRelease(workflow._id);
    const canManageNodes = workflowLevel(actor, workflow, project) === 'edit';
    return toNodeDto(
      node,
      artifact,
      level,
      this.publishState(artifact, lastMajorByArtifact, hasAnyRelease),
      canManageNodes,
    );
  }
}
