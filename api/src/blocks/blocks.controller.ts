import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { WorkflowAccessGuard } from '../common/guards/workflow-access.guard';
import { WorkflowAccess } from '../common/decorators/workflow-access.decorator';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { CurrentProject, CurrentWorkflow } from '../common/decorators/current-workflow.decorator';
import { Actor } from '../common/actor';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { BlocksService } from './blocks.service';
import { CanvasViewService } from './canvas-view.service';
import { EdgesService } from '../edges/edges.service';
import { ArtifactSourceService, CandidateIntent, CandidateSource } from '../artifacts/artifact-source.service';
import { CreateBlockDto, ReplaceRecipientsDto, UpdateBlockDto } from './dto/block-crud.dto';

/**
 * 캔버스 블록 라우트. 구 `deliverables` 라우트를 대체한다.
 *
 * 권한은 전부 WorkflowAccessGuard가 먼저 검증한다 — 그 과제의 member인지, 그리고
 * @WorkflowAccess가 요구하는 수준을 만족하는지(설계서 01장 §2.2, §3.2).
 */
@Controller()
@UseGuards(WorkflowAccessGuard)
export class BlocksController {
  constructor(
    private readonly blocks: BlocksService,
    private readonly canvasView: CanvasViewService,
    private readonly edges: EdgesService,
    private readonly sources: ArtifactSourceService,
  ) {}

  /**
   * Tier별 후보 목록 — pickable 판정까지 서버가 끝내서 내려준다(설계서 04장 §6).
   * source=live|hpc는 serviceKey만 있으면 된다 — project 사전 링크 단계는 없다. code/
   * revision은 그 workflow가 속한 project에서 그대로 채운다(§6.3). OA Service/HPC
   * Service 드롭다운 자체는 `GET /hub/services`(Manage Service 등록 목록)를 그대로 쓴다.
   */
  @Get('workflows/:workflowId/artifact-candidates')
  @WorkflowAccess('edit')
  async artifactCandidates(
    @Query('source') source: string,
    @Query('intent') intent: string,
    @Query('serviceKey') serviceKey: string | undefined,
    @CurrentProject() project: ProjectDocument,
    @CurrentActor() me: Actor,
  ) {
    if (!['live', 'file', 'hpc'].includes(source)) throw new BadRequestException('Unknown source.');
    if (!['own', 'received'].includes(intent)) throw new BadRequestException('Unknown intent.');
    return this.sources.listCandidates(
      project,
      me,
      source as CandidateSource,
      intent as CandidateIntent,
      serviceKey,
    );
  }

  @Get('workflows/:workflowId/blocks')
  @WorkflowAccess('view')
  async listForWorkflow(
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentProject() project: ProjectDocument,
    @CurrentActor() me: Actor,
  ) {
    return this.canvasView.assemble(workflow, project, me);
  }

  /**
   * 버전 목록 — 이제 SIREN 캐시에서 읽는다(설계서 07장 §3·§4, 04장 §7). A/B/C
   * (OA Service/File Artifacts/HPC Service) 공통이며, 열 때마다 그 서비스에 다시
   * 묻지 않는다. slide를 열었을 때만 그 block 하나에 대해 호출된다 — 캔버스 목록 조회는
   * 절대 이걸 부르지 않는다(설계서 05장 §8).
   */
  @Get('workflows/:workflowId/blocks/:blockId/live-versions')
  @WorkflowAccess('view')
  async liveVersions(
    @Param('blockId') blockId: string,
    @CurrentProject() project: ProjectDocument,
    @CurrentActor() me: Actor,
  ) {
    return this.canvasView.liveVersions(blockId, project, me);
  }

  /**
   * 한 버전의 html preview(설계서 04장 §19 확장). B Tier의 upload/download 자리를 A/C
   * Tier에서는 이걸로 대신한다 — slide가 latest version으로 최초 1번, 이후 사용자가 다른
   * (hasHtmlView인) 버전을 고를 때마다 호출한다.
   */
  @Get('workflows/:workflowId/blocks/:blockId/html-view')
  @WorkflowAccess('view')
  async htmlView(
    @Param('blockId') blockId: string,
    @Query('versionLabel') versionLabel: string,
    @CurrentProject() project: ProjectDocument,
    @CurrentActor() me: Actor,
  ) {
    if (!versionLabel) throw new BadRequestException('versionLabel is required.');
    return this.canvasView.htmlView(blockId, versionLabel, project, me);
  }

  @Post('workflows/:workflowId/blocks')
  @WorkflowAccess('edit')
  async create(
    @Body() dto: CreateBlockDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentProject() project: ProjectDocument,
    @CurrentActor() me: Actor,
  ) {
    const block = await this.blocks.create(workflow, project, dto, me);
    return this.canvasView.assembleOne(block, workflow, project, me);
  }

  @Patch('blocks/:id')
  @WorkflowAccess('edit')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateBlockDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentProject() project: ProjectDocument,
    @CurrentActor() me: Actor,
  ) {
    const block = await this.blocks.update(project, id, dto, me);
    return this.canvasView.assembleOne(block, workflow, project, me);
  }

  @Delete('blocks/:id')
  @WorkflowAccess('edit')
  async remove(@Param('id') id: string, @CurrentActor() me: Actor) {
    // 그 블록이 관여된 flow도 함께 정리한다 — 남겨두면 끊어진 화살표가 된다.
    await this.edges.deleteByBlockIds([id]);
    await this.blocks.remove(id, me);
    return { ok: true };
  }

  /**
   * block의 recipient 교체 — A/B/C/D 전부 공통이다(설계서 04장 §3.3).
   *
   * 편집 권한은 그 workflow의 **Edit Access**다 — recipient에 **속하는 것**과 recipient를
   * **편집하는 것**은 별개다(설계서 01장 §4.2). 즉 자기가 recipient가 아니어도 목록은
   * 고칠 수 있고, 대신 자기를 넣지 않으면 그 산출물의 slide는 못 연다.
   */
  @Patch('workflows/:workflowId/blocks/:blockId/recipients')
  @WorkflowAccess('edit')
  async replaceRecipients(
    @Param('blockId') blockId: string,
    @Body() dto: ReplaceRecipientsDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentProject() project: ProjectDocument,
    @CurrentActor() me: Actor,
  ) {
    const block = await this.blocks.replaceRecipients(blockId, dto, me);
    return this.canvasView.assembleOne(block, workflow, project, me);
  }
}
