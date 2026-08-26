import { SetMetadata } from '@nestjs/common';

export type WorkflowAccessLevel = 'edit' | 'view';
export const WORKFLOW_ACCESS_KEY = 'workflowAccess';

/**
 * @WorkflowAccess('edit')  → workflow.owners만 통과
 * @WorkflowAccess('view')  → workflow.owners 또는 workflow.viewGrants 통과
 * WorkflowAccessGuard와 함께 사용한다 (설계서 6.2).
 */
export const WorkflowAccess = (level: WorkflowAccessLevel) => SetMetadata(WORKFLOW_ACCESS_KEY, level);
