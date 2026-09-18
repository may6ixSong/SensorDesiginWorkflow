import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ReleaseItemFeedback,
  ReleaseItemFeedbackDocument,
  RELEASE_ITEM_FEEDBACK_STATUSES,
} from './schemas/release-item-feedback.schema';
import { ReleaseDocument } from './schemas/release.schema';
import {
  CreateReleaseItemFeedbackDto,
  ReleaseItemFeedbackDto,
  toReleaseItemFeedbackDto,
} from './dto/release-item-feedback.dto';
import { Actor } from '../common/actor';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { myDepartments } from '../common/access';

/**
 * release 안 한 산출물에 대한 부서별 상태/코멘트 이력(설계서 09장 §4.2).
 *
 * ★ 이 이력은 그 department 소속만 읽고 쓸 수 있다 — 다른 부서에는 존재 자체가 보이지
 *   않아야 한다(사용자 확정). 그래서 "그 department가 실제로 이 item의 recipient인가"와
 *   "actor가 지금 이 과제에서 그 department 소속인가(또는 Admin)"를 둘 다 매번 확인한다.
 */
@Injectable()
export class ReleaseFeedbackService {
  constructor(
    @InjectModel(ReleaseItemFeedback.name) private readonly model: Model<ReleaseItemFeedbackDocument>,
  ) {}

  /** release.items에서 그 blockId를 찾고, department가 실제 recipient인지, actor가 그
   *  department 소속인지(Admin 예외) 확인한다. 통과하면 그 item을 돌려준다. */
  private assertDepartmentAccess(
    release: ReleaseDocument,
    blockId: string,
    department: string,
    project: ProjectDocument | null,
    actor: Actor,
  ) {
    const item = (release.items ?? []).find((i) => i.blockId === blockId);
    if (!item) throw new NotFoundException('No such item in this release.');

    if (!(item.recipients?.departments ?? []).includes(department)) {
      throw new BadRequestException('That department did not receive this item.');
    }

    if (!actor.isAdmin && !myDepartments(actor, project).includes(department)) {
      throw new ForbiddenException('You are not a member of that department on this project.');
    }

    return item;
  }

  async listForItem(
    release: ReleaseDocument,
    blockId: string,
    department: string,
    project: ProjectDocument | null,
    actor: Actor,
  ): Promise<ReleaseItemFeedbackDto[]> {
    this.assertDepartmentAccess(release, blockId, department, project, actor);
    const docs = await this.model
      .find({ releaseId: release._id, blockId, department })
      .sort({ createdAt: 1 })
      .exec();
    return docs.map(toReleaseItemFeedbackDto);
  }

  async createForItem(
    release: ReleaseDocument,
    blockId: string,
    dto: CreateReleaseItemFeedbackDto,
    project: ProjectDocument | null,
    actor: Actor,
  ): Promise<ReleaseItemFeedbackDto> {
    const department = dto.department?.trim();
    if (!department) throw new BadRequestException('department is required.');
    this.assertDepartmentAccess(release, blockId, department, project, actor);

    if (!RELEASE_ITEM_FEEDBACK_STATUSES.includes(dto.status)) {
      throw new BadRequestException('status must be one of accepted, partial, blocked.');
    }
    const comment = dto.comment?.trim();
    if (!comment) throw new BadRequestException('comment is required.');

    const created = await this.model.create({
      releaseId: release._id as Types.ObjectId,
      blockId,
      department,
      status: dto.status,
      comment,
      createdBy: actor.knoxId,
      isMock: false,
    });
    return toReleaseItemFeedbackDto(created);
  }
}
