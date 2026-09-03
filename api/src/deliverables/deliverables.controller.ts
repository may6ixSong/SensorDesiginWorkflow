import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WorkflowAccessGuard } from '../common/guards/workflow-access.guard';
import { WorkflowAccess } from '../common/decorators/workflow-access.decorator';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { CurrentWorkflow } from '../common/decorators/current-workflow.decorator';
import { Actor } from '../common/actor';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { DeliverablesService } from './deliverables.service';
import { toDeliverableDto, toIncomingDeliverableDto, toVisibleVersions } from './dto/deliverable.dto';
import {
  AssertVersionDto,
  CreateDeliverableDto,
  ReleaseDto,
  UpdateDeliverableDto,
  UpdateRecvDto,
  UpdateScheduleDto,
} from './dto/deliverable-crud.dto';

@UseGuards(WorkflowAccessGuard)
@Controller()
export class DeliverablesController {
  constructor(private readonly deliverables: DeliverablesService) {}

  /**
   * BE가 giver 여부로 버전 가시성을 미리 필터링해서 응답한다 (Hub 설계서 §6.2).
   * `incoming`은 다른 workflow가 이 workflow를 recvWorkflowId로 지정한 산출물 — 항상 Release 버전만
   * 담겨 온다. 주는 쪽이 release()하면 이 목록도 즉시 그 결과를 반영한다.
   */
  @WorkflowAccess('view')
  @Get('workflows/:workflowId/deliverables')
  async listForWorkflow(@Param('workflowId') workflowId: string, @CurrentWorkflow() workflow: WorkflowDocument, @CurrentActor() me: Actor) {
    const [list, incoming] = await Promise.all([
      this.deliverables.listForWorkflow(workflowId),
      this.deliverables.listIncomingForWorkflow(workflowId),
    ]);
    return {
      data: list.map((d) => toDeliverableDto(d, workflow, me)),
      incoming: incoming.map(({ deliverable, sourceWorkflow }) => toIncomingDeliverableDto(deliverable, sourceWorkflow)),
    };
  }

  @WorkflowAccess('edit')
  @Post('workflows/:workflowId/deliverables')
  async create(
    @Param('workflowId') workflowId: string,
    @Body() dto: CreateDeliverableDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    const d = await this.deliverables.create(workflow, dto, me);
    return { data: toDeliverableDto(d, workflow, me) };
  }

  @WorkflowAccess('edit')
  @Patch('deliverables/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDeliverableDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    const d = await this.deliverables.update(id, dto, me);
    return { data: toDeliverableDto(d, workflow, me) };
  }

  @WorkflowAccess('edit')
  @Delete('deliverables/:id')
  async remove(@Param('id') id: string, @CurrentActor() me: Actor) {
    await this.deliverables.remove(id, me);
    return { data: { id } };
  }

  @WorkflowAccess('edit')
  @Patch('deliverables/:id/recv')
  async updateRecv(
    @Param('id') id: string,
    @Body() dto: UpdateRecvDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    const d = await this.deliverables.updateRecv(id, dto, me);
    return { data: toDeliverableDto(d, workflow, me) };
  }

  @WorkflowAccess('edit')
  @Patch('deliverables/:id/schedule')
  async updateSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    const list = await this.deliverables.updateSchedule(workflow, id, dto.phaseIds, me);
    return { data: list.map((d) => toDeliverableDto(d, workflow, me)) };
  }

  @WorkflowAccess('view')
  @Get('deliverables/:id/versions')
  async versions(@Param('id') id: string, @CurrentWorkflow() workflow: WorkflowDocument, @CurrentActor() me: Actor) {
    const d = await this.deliverables.findOrThrow(id);
    return { data: toVisibleVersions(d, workflow, me) };
  }

  /**
   * C/D 티어 수동 버전 기록 (Hub 설계서 §9). 연동된 서비스가 소유한 산출물(A/B)은
   * 서비스가 거절한다 - 실물 업로드와 버전 생성은 그쪽에서 일어난다(§1.2).
   */
  @WorkflowAccess('edit')
  @Post('deliverables/:id/versions')
  async assertVersion(
    @Param('id') id: string,
    @Body() dto: AssertVersionDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    const d = await this.deliverables.assertVersion(id, dto, me);
    return { data: toDeliverableDto(d, workflow, me) };
  }

  @WorkflowAccess('edit')
  @Post('deliverables/:id/release')
  async release(
    @Param('id') id: string,
    @Body() dto: ReleaseDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    const d = await this.deliverables.release(id, dto, me);
    return { data: toDeliverableDto(d, workflow, me) };
  }
}
