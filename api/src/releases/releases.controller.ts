import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorkflowAccessGuard } from '../common/guards/workflow-access.guard';
import { WorkflowAccess } from '../common/decorators/workflow-access.decorator';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { CurrentProject, CurrentWorkflow } from '../common/decorators/current-workflow.decorator';
import { Actor } from '../common/actor';
import { Workflow, WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { Project, ProjectDocument } from '../projects/schemas/project.schema';
import { canAccessProject, myDepartments, workflowLevel } from '../common/access';
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
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(Workflow.name) private readonly workflowModel: Model<WorkflowDocument>,
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
   * release 한 건의 상세(설계서 02장 §7.4). My Assignment가 목록의 행을 눌렀을 때 여는
   * 다이얼로그가 이 라우트를 쓴다 — 목록은 과제를 가로지르므로 workflow 단위 Guard를
   * 걸 수 없고, 대신 여기서 "이 release를 볼 자격"을 직접 판정한다.
   *
   * 자격은 넷 중 하나다: 그 release의 recipient(개인 또는 부서) · 실행자 본인 · 그
   * workflow 소속 부서 · 그 workflow에 대한 view 이상 권한. **그 전에 Project 계층이
   * 먼저다** — 그 과제의 member가 아니면 나머지는 보지도 않는다(설계서 01장 §2.2).
   *
   * 산출물별 마스킹은 여기서도 **열람 시점 기준**으로 매번 다시 판정한다(05장 §5) —
   * 목록이 버전 라벨을 아예 싣지 않는 이유가 이것이고, 그 판정은 이 한 건에 대해서만 돈다.
   */
  @Get('releases/:releaseId')
  async getOne(@Param('releaseId') releaseId: string, @CurrentActor() me: Actor) {
    const release = await this.releases.findOrThrow(releaseId);
    const project = await this.projectModel.findById(release.projectId).exec();
    if (!canAccessProject(me, project)) {
      throw new ForbiddenException('You do not have access to this project.');
    }

    if (!me.isAdmin) {
      const myDepts = myDepartments(me, project);
      const workflow = await this.workflowModel.findById(release.workflowId).exec();
      const allowed =
        (release.recipientUsers ?? []).includes(me.knoxId) ||
        (release.recipientDepartments ?? []).some((d) => myDepts.includes(d)) ||
        release.releasedBy === me.knoxId ||
        myDepts.includes(release.workflowAt?.department ?? '') ||
        workflowLevel(me, workflow, project) !== null;
      if (!allowed) throw new ForbiddenException('You do not have access to this release.');
    }

    return toReleaseDto(release, await this.visibleArtifactIds(release, project, me));
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
