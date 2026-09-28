import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { WorkflowAccessGuard } from '../common/guards/workflow-access.guard';
import { WorkflowAccess } from '../common/decorators/workflow-access.decorator';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { CurrentWorkflow } from '../common/decorators/current-workflow.decorator';
import { Actor } from '../common/actor';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { AutoRunService } from './auto-run.service';

export class SetAutoRunDto {
  @IsBoolean()
  enabled: boolean;
}

/**
 * node 슬라이드의 Auto Run 탭(설계서 10장 §8.2). 설정·실행 이력 조회·지금 실행 전부
 * workflow **Edit Access**가 있어야 한다(사용자 결정 A8) — 탭 자체도 Edit Access에게만 보인다.
 */
@Controller('workflows/:workflowId/nodes/:nodeId/auto-run')
@UseGuards(WorkflowAccessGuard)
export class AutoRunController {
  constructor(private readonly autoRun: AutoRunService) {}

  @Get()
  @WorkflowAccess('edit')
  async state(@Param('nodeId') nodeId: string, @CurrentWorkflow() workflow: WorkflowDocument) {
    return { data: await this.autoRun.getState(workflow, nodeId) };
  }

  @Put()
  @WorkflowAccess('edit')
  async setEnabled(
    @Param('nodeId') nodeId: string,
    @Body() dto: SetAutoRunDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    return { data: await this.autoRun.setEnabled(workflow, nodeId, dto.enabled, me) };
  }

  @Post('runs')
  @WorkflowAccess('edit')
  async runNow(
    @Param('nodeId') nodeId: string,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    return { data: await this.autoRun.runNow(workflow, nodeId, me) };
  }
}
