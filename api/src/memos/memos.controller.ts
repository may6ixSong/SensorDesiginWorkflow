import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { WorkflowAccessGuard } from '../common/guards/workflow-access.guard';
import { WorkflowAccess } from '../common/decorators/workflow-access.decorator';
import { MemosService } from './memos.service';

/**
 * 메모는 **캔버스의 일부**다.
 *
 * 예전에는 Edit 권한자에게만 보여줬지만, 이제 캔버스는 Edit/View 권한자가 **완전히
 * 동일한 화면**을 본다(설계서 03장 §1). 메모만 한쪽에서 사라지면 같은 캔버스가 아니게
 * 되므로 view 권한자에게도 그대로 내려준다.
 *
 * 권한 자체는 WorkflowAccessGuard가 이미 검증했다 — 여기 도달했다면 최소 view는 있다.
 */
@UseGuards(WorkflowAccessGuard)
@Controller('workflows/:workflowId/memos')
export class MemosController {
  constructor(private readonly memos: MemosService) {}

  @WorkflowAccess('view')
  @Get()
  async list(@Param('workflowId') workflowId: string) {
    return { data: await this.memos.listForWorkflow(workflowId) };
  }
}
