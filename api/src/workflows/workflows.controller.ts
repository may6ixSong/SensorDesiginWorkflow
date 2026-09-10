import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { WorkflowAccessGuard } from '../common/guards/workflow-access.guard';
import { WorkflowAccess } from '../common/decorators/workflow-access.decorator';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { CurrentWorkflow, CurrentWorkflowLevel } from '../common/decorators/current-workflow.decorator';
import { Actor } from '../common/actor';
import { AccessLevel } from '../common/access';
import { WorkflowDocument } from './schemas/workflow.schema';
import { WorkflowsService } from './workflows.service';
import { toWorkflowDto } from './dto/workflow.dto';
import {
  ReplaceWorkflowAccessDto,
  UpdateWorkflowDto,
  UpdateWorkflowPhasesDto,
} from './dto/workflow-crud.dto';

@UseGuards(WorkflowAccessGuard)
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @WorkflowAccess('view')
  @Get(':workflowId')
  async getOne(@CurrentWorkflow() workflow: WorkflowDocument, @CurrentWorkflowLevel() level: AccessLevel) {
    return { data: toWorkflowDto(workflow, level) };
  }

  /**
   * Name / Description / Department **단일 PATCH** (설계서 02장 §7.2).
   *
   * Department 변경도 여기서 처리한다 — 화면의 Save 버튼이 하나이므로 API도 하나여야
   * 둘이 어긋나지 않는다. 변경 시 editAccess의 부서 교체까지 서비스가 한 번에 처리한다.
   * 변경 권한은 **Edit Access 전원**이다.
   *
   * ★ canvasLock을 확인하지 않는다 — 누가 캔버스를 편집 중이어도 이 값들은 바뀔 수 있다.
   */
  @WorkflowAccess('edit')
  @Patch(':workflowId')
  async update(
    @Param('workflowId') workflowId: string,
    @Body() body: UpdateWorkflowDto,
    @CurrentActor() me: Actor,
  ) {
    const workflow = await this.workflows.updateMeta(workflowId, body, me);
    return { data: toWorkflowDto(workflow, 'edit') };
  }

  /**
   * 권한 한 벌 통째 교체 (설계서 01장 §3.3).
   * workflow 소속 부서의 Edit Access 항목은 서버가 다시 넣으므로 삭제되지 않는다.
   */
  @WorkflowAccess('edit')
  @Put(':workflowId/access')
  async replaceAccess(
    @Param('workflowId') workflowId: string,
    @Body() body: ReplaceWorkflowAccessDto,
    @CurrentActor() me: Actor,
  ) {
    const workflow = await this.workflows.replaceAccess(workflowId, body, me);
    return { data: toWorkflowDto(workflow, 'edit') };
  }

  /**
   * 이 workflow만의 일정 교체. 사라진 phase를 가리키던 블록은 그대로 남는다 —
   * 서버는 블록을 절대 옮기거나 지우지 않는다.
   * ★ 이 PATCH도 canvasLock과 무관하다.
   */
  @WorkflowAccess('edit')
  @Patch(':workflowId/phases')
  async updatePhases(
    @Param('workflowId') workflowId: string,
    @Body() body: UpdateWorkflowPhasesDto,
    @CurrentActor() me: Actor,
  ) {
    const workflow = await this.workflows.updatePhases(workflowId, body.phases, me);
    return { data: toWorkflowDto(workflow, 'edit') };
  }

  /* ------------------------------------------------------------------ *
   * 캔버스 편집 lock (설계서 03장 §3)
   * ------------------------------------------------------------------ */

  /** 점유 또는 갱신(하트비트). 남이 살아 있는 lock을 들고 있으면 409. */
  @WorkflowAccess('edit')
  @Post(':workflowId/canvas-lock')
  async acquireLock(@Param('workflowId') workflowId: string, @CurrentActor() me: Actor) {
    return { data: await this.workflows.acquireCanvasLock(workflowId, me) };
  }

  /** 해제. 본인 또는 Admin(강제 해제)만 가능하다. */
  @WorkflowAccess('edit')
  @Delete(':workflowId/canvas-lock')
  async releaseLock(@Param('workflowId') workflowId: string, @CurrentActor() me: Actor) {
    return { data: await this.workflows.releaseCanvasLock(workflowId, me) };
  }
}
