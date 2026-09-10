import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Workflow, WorkflowDocument } from '../../workflows/schemas/workflow.schema';
import { Block, BlockDocument } from '../../blocks/schemas/block.schema';
import { Project, ProjectDocument } from '../../projects/schemas/project.schema';
import { WORKFLOW_ACCESS_KEY, WorkflowAccessLevel } from '../decorators/workflow-access.decorator';
import { resolveActor } from '../actor';
import { canAccessProject, workflowLevel } from '../access';

/**
 * ★ 이제 **실제로 차단한다.** (예전에는 문서를 캐시만 하고 판정을 web에 맡겼다.)
 *
 * 설계가 바뀌면서 권한 필터가 전 시스템 규칙이 되었고(설계서 01장), 특히 **Project 계층이
 * 최종 관문**이 되었다 — 그 과제의 members가 아니면 workflow 권한을 받았더라도 라우팅으로
 * 접근할 수 없어야 한다(01장 §2.2). FE가 목록에서 빼는 것만으로는 부족하다.
 *
 * 판정 순서:
 *   1) X-Knox-Id 헤더 (없으면 401)
 *   2) Workflow 조회 (없으면 404)
 *   3) Project 조회 → members 확인 (아니면 403)
 *   4) workflowLevel 계산 → @WorkflowAccess가 요구하는 수준에 못 미치면 403
 *
 * 통과하면 workflow/project/level을 req에 캐시해 컨트롤러가 재조회하지 않게 한다.
 * Admin은 모든 단계를 통과한다.
 */
@Injectable()
export class WorkflowAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectModel(Workflow.name) private readonly workflowModel: Model<WorkflowDocument>,
    @InjectModel(Block.name) private readonly blockModel: Model<BlockDocument>,
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<WorkflowAccessLevel>(WORKFLOW_ACCESS_KEY, ctx.getHandler());
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest();
    const actor = resolveActor(req);

    const workflow = await this.resolveWorkflow(req);
    if (!workflow) throw new NotFoundException('Workflow not found.');

    const project = await this.projectModel.findById(workflow.projectId).exec();

    // Project 계층이 먼저다 — members가 아니면 그 아래는 볼 것도 없다.
    if (!canAccessProject(actor, project)) {
      throw new ForbiddenException('You do not have access to this project.');
    }

    const level = workflowLevel(actor, workflow, project);
    if (level === null) {
      throw new ForbiddenException('You do not have access to this workflow.');
    }
    if (required === 'edit' && level !== 'edit') {
      throw new ForbiddenException('You do not have edit access to this workflow.');
    }

    req.workflow_ = workflow;
    req.project_ = project;
    req.workflowLevel_ = level;
    return true;
  }

  /**
   * workflowId 파라미터가 있는 라우트는 그대로 조회하고, blockId(:id) 파라미터만 있는
   * 라우트는 block.workflowId로 역추적한다.
   */
  private async resolveWorkflow(req: any): Promise<WorkflowDocument | null> {
    const params = req.params ?? {};
    if (params.workflowId) {
      return this.workflowModel.findById(params.workflowId).exec();
    }
    const blockId = params.blockId ?? params.id;
    if (blockId) {
      const block = await this.blockModel.findById(blockId).exec();
      if (!block) throw new NotFoundException('Block not found.');
      return this.workflowModel.findById(block.workflowId).exec();
    }
    return null;
  }
}
