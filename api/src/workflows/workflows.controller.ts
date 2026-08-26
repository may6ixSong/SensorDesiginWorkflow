import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { WorkflowAccessGuard } from '../common/guards/workflow-access.guard';
import { WorkflowAccess } from '../common/decorators/workflow-access.decorator';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { Actor } from '../common/actor';
import { WorkflowsService } from './workflows.service';
import { toWorkflowDto } from './dto/workflow.dto';
import { AddOwnerDto, AddViewGrantDto } from './dto/manage-access.dto';
import { UpdateWorkflowDto, UpdateWorkflowPhasesDto } from './dto/workflow-crud.dto';

@UseGuards(WorkflowAccessGuard)
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @WorkflowAccess('view')
  @Get(':workflowId')
  async getOne(@Param('workflowId') workflowId: string, @CurrentActor() me: Actor) {
    const workflow = await this.workflows.findOrThrow(workflowId);
    return { data: toWorkflowDto(workflow, me) };
  }

  @WorkflowAccess('edit')
  @Patch(':workflowId')
  async update(
    @Param('workflowId') workflowId: string,
    @Body() body: UpdateWorkflowDto,
    @CurrentActor() me: Actor,
  ) {
    const workflow = await this.workflows.updateMeta(workflowId, body, me);
    return { data: toWorkflowDto(workflow, me) };
  }

  /**
   * 이 workflow만의 일정 교체. 사라진 phase를 가리키던 산출물은 그대로 남는다 —
   * 서버는 산출물을 절대 옮기거나 지우지 않는다(WorkflowsService.updatePhases 주석 참고).
   */
  @WorkflowAccess('edit')
  @Patch(':workflowId/phases')
  async updatePhases(
    @Param('workflowId') workflowId: string,
    @Body() body: UpdateWorkflowPhasesDto,
    @CurrentActor() me: Actor,
  ) {
    const workflow = await this.workflows.updatePhases(workflowId, body.phases, me);
    return { data: toWorkflowDto(workflow, me) };
  }

  @WorkflowAccess('edit')
  @Post(':workflowId/owners')
  async addOwner(@Param('workflowId') workflowId: string, @Body() body: AddOwnerDto, @CurrentActor() me: Actor) {
    const workflow = await this.workflows.addOwner(workflowId, body.knoxId, body.department, me);
    return { data: toWorkflowDto(workflow, me) };
  }

  @WorkflowAccess('edit')
  @Delete(':workflowId/owners/:knoxId')
  async removeOwner(
    @Param('workflowId') workflowId: string,
    @Param('knoxId') knoxId: string,
    @CurrentActor() me: Actor,
  ) {
    const workflow = await this.workflows.removeOwner(workflowId, knoxId, me);
    return { data: toWorkflowDto(workflow, me) };
  }

  @WorkflowAccess('edit')
  @Post(':workflowId/view-grants')
  async addViewGrant(
    @Param('workflowId') workflowId: string,
    @Body() body: AddViewGrantDto,
    @CurrentActor() me: Actor,
  ) {
    const workflow = await this.workflows.addViewGrant(workflowId, body.knoxId, body.department, me);
    return { data: toWorkflowDto(workflow, me) };
  }

  @WorkflowAccess('edit')
  @Delete(':workflowId/view-grants/:knoxId')
  async removeViewGrant(
    @Param('workflowId') workflowId: string,
    @Param('knoxId') knoxId: string,
    @CurrentActor() me: Actor,
  ) {
    const workflow = await this.workflows.removeViewGrant(workflowId, knoxId, me);
    return { data: toWorkflowDto(workflow, me) };
  }
}
