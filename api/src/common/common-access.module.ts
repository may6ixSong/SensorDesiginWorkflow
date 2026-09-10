import { Module } from '@nestjs/common';
import { Workflow, WorkflowSchema } from '../workflows/schemas/workflow.schema';
import { Block, BlockSchema } from '../blocks/schemas/block.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { registerModels } from '../database/model-registration';
import { WorkflowAccessGuard } from './guards/workflow-access.guard';

const Models = registerModels([
  { name: Workflow.name, schema: WorkflowSchema },
  { name: Block.name, schema: BlockSchema },
  { name: Project.name, schema: ProjectSchema },
]);

/**
 * Workflow/Block/Project 모델과 WorkflowAccessGuard를 한 곳에서 등록해 공유한다 — 이들을
 * 쓰는 모듈(workflows, blocks, artifacts, releases, edges, memos, canvas)이 각자 다시
 * 등록하지 않고 CommonAccessModule만 import한다.
 *
 * 가드가 세 모델을 모두 필요로 하기 때문에(Project 계층이 최종 관문이라 Project까지 본다)
 * 모델 등록과 가드 제공을 함께 묶는다.
 */
@Module({
  imports: [Models],
  providers: [WorkflowAccessGuard],
  exports: [Models, WorkflowAccessGuard],
})
export class CommonAccessModule {}
