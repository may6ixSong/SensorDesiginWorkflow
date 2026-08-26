import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { WorkflowDocument } from '../../workflows/schemas/workflow.schema';

/** WorkflowAccessGuard가 req.workflow_에 캐시해둔 Workflow 문서를 꺼낸다 (재조회 방지). */
export const CurrentWorkflow = createParamDecorator((_: unknown, ctx: ExecutionContext): WorkflowDocument => {
  const req = ctx.switchToHttp().getRequest();
  return req.workflow_;
});
