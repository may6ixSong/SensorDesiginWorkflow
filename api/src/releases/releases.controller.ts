import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { WorkflowAccessGuard } from '../common/guards/workflow-access.guard';
import { WorkflowAccess } from '../common/decorators/workflow-access.decorator';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { CurrentProject, CurrentWorkflow } from '../common/decorators/current-workflow.decorator';
import { Actor } from '../common/actor';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { ReleasesService } from './releases.service';
import { CreateReleaseDto } from './dto/release-crud.dto';
import { toReleaseDto } from './dto/release.dto';
import { ArtifactsService } from '../artifacts/artifacts.service';
import { ArtifactAccessService } from '../artifacts/artifact-access.service';
import { BlocksService } from '../blocks/blocks.service';

/**
 * Release 라우트 (설계서 05장).
 *
 * ★ update/delete 라우트가 **없다.** 철회(Revoke)도 없다 — 약속된 시나리오이므로 실수로
 *   열리지 않도록 아예 만들지 않는다(설계서 05장 §4.5).
 */
@Controller()
@UseGuards(WorkflowAccessGuard)
export class ReleasesController {
  constructor(
    private readonly releases: ReleasesService,
    private readonly artifacts: ArtifactsService,
    private readonly artifactAccess: ArtifactAccessService,
    private readonly blocks: BlocksService,
  ) {}

  /** 지금 release하면 무엇이 나갈지. 실행과 같은 로직으로 계산한다. */
  @Get('workflows/:workflowId/release/preview')
  @WorkflowAccess('edit')
  async preview(@CurrentWorkflow() workflow: WorkflowDocument, @CurrentActor() me: Actor) {
    return this.releases.preview(workflow, me);
  }

  /** 실행. 권한은 Edit Access 전원이다(설계서 05장 §4.4). */
  @Post('workflows/:workflowId/releases')
  @WorkflowAccess('edit')
  async create(
    @Body() dto: CreateReleaseDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentProject() project: ProjectDocument,
    @CurrentActor() me: Actor,
  ) {
    const release = await this.releases.create(workflow, dto, me);
    return toReleaseDto(release, await this.visibleArtifactIds(release, project, me));
  }

  @Get('workflows/:workflowId/releases')
  @WorkflowAccess('view')
  async listForWorkflow(
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentProject() project: ProjectDocument,
    @CurrentActor() me: Actor,
  ) {
    const releases = await this.releases.listForWorkflow(workflow._id.toString());
    return Promise.all(
      releases.map(async (r) => toReleaseDto(r, await this.visibleArtifactIds(r, project, me))),
    );
  }

  /**
   * 이 사람이 지금 열람 권한을 가진 artifact id 집합.
   * A Tier는 그 산출물이 놓인 block의 recipient + 그 서비스 권한을 함께 봐야 하므로
   * block을 같이 넘긴다(설계서 04장 §4.1).
   *
   * ★ Admin은 artifact/block 조회와 무관하게 항상 통과한다(설계서 01장 §2.1 "Admin은
   *   전 계층 무조건 통과") — 이전엔 이 판정 전에 artifact 조회부터 실패하면(다음 항목
   *   참고) Admin조차 masked로 내려갔다. 그 실패를 이유로 거를 대상이 애초에 아니므로
   *   여기서 I/O 없이 먼저 걸러 낸다.
   * ★ release는 그 시점의 사실을 얼려 둔다(release.schema.ts#ReleaseItem.published —
   *   설계서 05장 §5) — item.artifactId가 가리키던 SIREN artifact 문서가 그 뒤 지워져도
   *   (재생성 등) 이력 자체는 읽을 수 있어야 한다. 하지만 이 마스킹 판정은 "지금 권한"을
   *   라이브로 다시 묻는 절차라 물어볼 artifact가 있어야 한다 — 그래서 원래 문서가
   *   없으면, 같은 block에 지금 매핑돼 있는 artifact(있다면)로 대신 판정한다. 그마저
   *   없으면(block도 지워졌거나 미매핑) 물어볼 곳이 정말 없으므로 fail-closed(masked)로
   *   남는다 — 이전과 같은 안전한 기본값이다.
   */
  private async visibleArtifactIds(
    release: { items?: { artifactId: string; blockId: string }[] },
    project: ProjectDocument | null,
    me: Actor,
  ): Promise<Set<string>> {
    const visible = new Set<string>();
    await Promise.all(
      (release.items ?? []).map(async (item) => {
        if (me.isAdmin) {
          visible.add(item.artifactId);
          return;
        }

        const [artifact, block] = await Promise.all([
          this.artifacts.findOrThrow(item.artifactId).catch(() => null),
          // 블록이 그새 지워졌을 수 있다 — 그러면 A Tier는 recipient를 물어볼 곳이 없어 막힌다.
          this.blocks.findOrThrow(item.blockId).catch(() => null),
        ]);

        const liveArtifact = artifact
          ?? (block?.artifactId ? await this.artifacts.findOrThrow(block.artifactId.toString()).catch(() => null) : null);
        if (!liveArtifact) return;

        const level = await this.artifactAccess.levelFor(me, liveArtifact, block, project);
        if (level !== null) visible.add(item.artifactId);
      }),
    );
    return visible;
  }
}
