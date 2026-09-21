import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { WorkflowAccessGuard } from '../common/guards/workflow-access.guard';
import { WorkflowAccess } from '../common/decorators/workflow-access.decorator';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { Actor } from '../common/actor';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/comment.dto';

/**
 * Artifact 댓글 라우트.
 *
 * ★ Comments 탭은 **이 workflow의 Edit Access가 있는 사람에게만** 열린다(사용자 결정,
 *   설계서 01장 §3.8 확장) — artifact 자체의 view/edit 권한이나 block.recipients 소속과
 *   무관하다. workflow를 view 권한으로만 보는 사람, 또는 그 artifact의 편집 권한이나
 *   recipient 자격이 있어도 workflow Edit Access가 없는 사람에게는 읽기(list)도, 쓰기
 *   (create)도 열지 않는다 — 그래서 두 라우트 모두 `@WorkflowAccess('edit')`이다.
 */
@Controller('workflows/:workflowId/blocks/:blockId/comments')
@UseGuards(WorkflowAccessGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @WorkflowAccess('edit')
  async list(@Param('blockId') blockId: string) {
    return { data: await this.comments.listForBlock(blockId) };
  }

  @Post()
  @WorkflowAccess('edit')
  async create(
    @Param('blockId') blockId: string,
    @Body() dto: CreateCommentDto,
    @CurrentActor() me: Actor,
  ) {
    return this.comments.createForBlock(blockId, dto, me);
  }
}
