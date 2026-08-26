import { Module } from '@nestjs/common';
import { Workflow, WorkflowSchema } from '../workflows/schemas/workflow.schema';
import { Deliverable, DeliverableSchema } from '../deliverables/schemas/deliverable.schema';
import { registerModels } from '../database/model-registration';
import { WorkflowAccessGuard } from './guards/workflow-access.guard';

const Models = registerModels([
  { name: Workflow.name, schema: WorkflowSchema },
  { name: Deliverable.name, schema: DeliverableSchema },
]);

/**
 * Workflow/Deliverable 모델과 WorkflowAccessGuard를 한 곳에서 등록해 공유한다 - 이 둘을 쓰는
 * 모듈(workflows, deliverables, hld, edges, memos, canvas)이 각자 다시 등록하지 않고
 * CommonAccessModule만 import한다. WorkflowAccessGuard가 두 모델을 모두 필요로 하기 때문에
 * (src/common/guards/workflow-access.guard.ts) 모델 등록과 가드 제공을 함께 묶는다.
 */
@Module({
  imports: [Models],
  providers: [WorkflowAccessGuard],
  exports: [Models, WorkflowAccessGuard],
})
export class CommonAccessModule {}
