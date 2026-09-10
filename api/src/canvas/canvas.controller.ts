import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { WorkflowAccessGuard } from '../common/guards/workflow-access.guard';
import { WorkflowAccess } from '../common/decorators/workflow-access.decorator';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { CurrentProject, CurrentWorkflow } from '../common/decorators/current-workflow.decorator';
import { Actor } from '../common/actor';
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { CanvasService } from './canvas.service';
import { PutCanvasDto } from './dto/put-canvas.dto';

@UseGuards(WorkflowAccessGuard)
@Controller('workflows/:workflowId/canvas')
export class CanvasController {
  constructor(private readonly canvas: CanvasService) {}

  @WorkflowAccess('edit')
  @Put()
  async put(
    @Param('workflowId') _workflowId: string,
    @Body() dto: PutCanvasDto,
    @CurrentWorkflow() workflow: WorkflowDocument,
    @CurrentProject() project: ProjectDocument,
    @CurrentActor() me: Actor,
  ) {
    const result = await this.canvas.apply(workflow, project, dto, me);
    return { data: result };
  }
}
