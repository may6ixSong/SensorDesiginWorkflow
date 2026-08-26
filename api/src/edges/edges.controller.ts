import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { WorkflowAccessGuard } from '../common/guards/workflow-access.guard';
import { WorkflowAccess } from '../common/decorators/workflow-access.decorator';
import { EdgesService } from './edges.service';

@UseGuards(WorkflowAccessGuard)
@Controller('workflows/:workflowId/edges')
export class EdgesController {
  constructor(private readonly edges: EdgesService) {}

  @WorkflowAccess('view')
  @Get()
  async list(@Param('workflowId') workflowId: string) {
    const edges = await this.edges.listForWorkflow(workflowId);
    return { data: edges };
  }
}
