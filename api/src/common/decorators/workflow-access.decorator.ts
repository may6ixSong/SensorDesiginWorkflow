import { SetMetadata } from '@nestjs/common';

export type WorkflowAccessLevel = 'edit' | 'view';
export const WORKFLOW_ACCESS_KEY = 'workflowAccess';

/**
 * @WorkflowAccess('edit')  → Owner · Edit Access · Admin 만 통과
 * @WorkflowAccess('view')  → 위 + View Access 통과
 *
 * 어느 쪽이든 **그 과제의 member여야 한다** — Project 계층이 최종 관문이다(설계서 01장 §2.2).
 * WorkflowAccessGuard가 실제로 차단한다.
 */
export const WorkflowAccess = (level: WorkflowAccessLevel) => SetMetadata(WORKFLOW_ACCESS_KEY, level);
