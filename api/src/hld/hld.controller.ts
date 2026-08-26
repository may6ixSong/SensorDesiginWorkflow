import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { WorkflowAccessGuard } from '../common/guards/workflow-access.guard';
import { WorkflowAccess } from '../common/decorators/workflow-access.decorator';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { CurrentWorkflow } from '../common/decorators/current-workflow.decorator';
import { Actor } from '../common/actor';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { HldService } from './hld.service';
import { CreateHldReleaseDto } from './dto/hld.dto';

@UseGuards(WorkflowAccessGuard)
@Controller('workflows/:workflowId/hld-releases')
export class HldController {
  constructor(private readonly hld: HldService) {}

  @WorkflowAccess('view')
  @Get()
  async list(@Param('workflowId') workflowId: string) {
    const list = await this.hld.listForWorkflow(workflowId);
    return { data: list };
  }

  @WorkflowAccess('edit')
  @Post()
  async create(
    @Param('workflowId') _workflowId: string,
    @Body() dto: CreateHldReleaseDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentActor() me: Actor,
  ) {
    const hld = await this.hld.createRelease(workflow, dto.note, me);
    return { data: hld };
  }
}
