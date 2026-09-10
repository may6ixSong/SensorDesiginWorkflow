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
   */
  private async visibleArtifactIds(
    release: { items?: { artifactId: string; blockId: string }[] },
    project: ProjectDocument | null,
    me: Actor,
  ): Promise<Set<string>> {
    const visible = new Set<string>();
    await Promise.all(
      (release.items ?? []).map(async (item) => {
        const artifact = await this.artifacts.findOrThrow(item.artifactId).catch(() => null);
        if (!artifact) return;
        // 블록이 그새 지워졌을 수 있다 — 그러면 A Tier는 recipient를 물어볼 곳이 없어 막힌다.
        const block = await this.blocks.findOrThrow(item.blockId).catch(() => null);
        const level = await this.artifactAccess.levelFor(me, artifact, block, project);
        if (level !== null) visible.add(item.artifactId);
      }),
    );
    return visible;
  }
}
