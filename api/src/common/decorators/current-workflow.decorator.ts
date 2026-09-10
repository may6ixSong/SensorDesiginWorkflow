import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { WorkflowDocument } from '../../workflows/schemas/workflow.schema';
import { ProjectDocument } from '../../projects/schemas/project.schema';
import { AccessLevel } from '../access';

/** WorkflowAccessGuard가 req에 캐시해둔 Workflow 문서를 꺼낸다 (재조회 방지). */
export const CurrentWorkflow = createParamDecorator((_: unknown, ctx: ExecutionContext): WorkflowDocument => {
  return ctx.switchToHttp().getRequest().workflow_;
});

/** 같은 가드가 캐시해둔 소속 Project 문서 — 부서 판정에 필요하다. */
export const CurrentProject = createParamDecorator((_: unknown, ctx: ExecutionContext): ProjectDocument => {
  return ctx.switchToHttp().getRequest().project_;
});

/** 가드가 계산해둔 이 사람의 workflow 실효 권한('edit' | 'view'). */
export const CurrentWorkflowLevel = createParamDecorator((_: unknown, ctx: ExecutionContext): AccessLevel => {
  return ctx.switchToHttp().getRequest().workflowLevel_ ?? null;
});
