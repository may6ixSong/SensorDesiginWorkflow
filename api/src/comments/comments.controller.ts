import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { WorkflowAccessGuard } from '../common/guards/workflow-access.guard';
import { WorkflowAccess } from '../common/decorators/workflow-access.decorator';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { CurrentProject } from '../common/decorators/current-workflow.decorator';
import { Actor } from '../common/actor';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/comment.dto';

/**
 * Artifact 댓글 라우트. slide(block)를 여는 사람만 의미가 있으므로 live-versions/html-view와
 * 동일하게 block 컨텍스트로 접근한다 - artifact 열람 권한(recipients 포함)은 block 없이는
 * 판정할 수 없다(ArtifactAccessService.assertCanOpen).
 */
@Controller('workflows/:workflowId/blocks/:blockId/comments')
@UseGuards(WorkflowAccessGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @WorkflowAccess('view')
  async list(@Param('blockId') blockId: string, @CurrentProject() project: ProjectDocument, @CurrentActor() me: Actor) {
    return { data: await this.comments.listForBlock(blockId, project, me) };
  }

  @Post()
  @WorkflowAccess('view')
  async create(
    @Param('blockId') blockId: string,
    @Body() dto: CreateCommentDto,
    @CurrentProject() project: ProjectDocument,
    @CurrentActor() me: Actor,
  ) {
    return this.comments.createForBlock(blockId, dto, project, me);
  }
}
