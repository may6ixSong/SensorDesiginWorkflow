import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ReleaseFeedback,
  ReleaseFeedbackDocument,
  RELEASE_FEEDBACK_STATUSES,
} from './schemas/release-feedback.schema';
import { ReleaseDocument } from './schemas/release.schema';
import { CreateReleaseFeedbackDto, ReleaseFeedbackDto, toReleaseFeedbackDto } from './dto/release-feedback.dto';
import { Actor } from '../common/actor';
import { ProjectDocument } from '../projects/schemas/project.schema';
import { myDepartments } from '../common/access';

/**
 * release 한 건에 대한 부서별 댓글 스레드(설계서 09장 §4.2~4.3) — 산출물 단위가 아니라
 * release 전체에 대한 것이다(사용자 확정).
 *
 * ★ 이 스레드는 그 department 소속만 읽고 쓸 수 있다 — 다른 부서에는 존재 자체가 보이지
 *   않아야 한다(사용자 확정). 그래서 "그 department가 실제로 이 release의 recipient인가"와
 *   "actor가 지금 이 과제에서 그 department 소속인가(또는 Admin)"를 둘 다 매번 확인한다.
 */
@Injectable()
export class ReleaseFeedbackService {
  constructor(
    @InjectModel(ReleaseFeedback.name) private readonly model: Model<ReleaseFeedbackDocument>,
  ) {}

  /** department가 실제로 이 release를 받았는지, actor가 그 department 소속인지(Admin 예외)
   *  확인한다. */
  private assertDepartmentAccess(
    release: ReleaseDocument,
    department: string,
    project: ProjectDocument | null,
    actor: Actor,
  ) {
    if (!(release.recipientDepartments ?? []).includes(department)) {
      throw new BadRequestException('That department did not receive this release.');
    }
    if (!actor.isAdmin && !myDepartments(actor, project).includes(department)) {
      throw new ForbiddenException('You are not a member of that department on this project.');
    }
  }

  async listForRelease(
    release: ReleaseDocument,
    department: string,
    project: ProjectDocument | null,
    actor: Actor,
  ): Promise<ReleaseFeedbackDto[]> {
    this.assertDepartmentAccess(release, department, project, actor);
    const docs = await this.model
      .find({ releaseId: release._id, department })
      .sort({ createdAt: 1 })
      .exec();
    return docs.map(toReleaseFeedbackDto);
  }

  async createForRelease(
    release: ReleaseDocument,
    dto: CreateReleaseFeedbackDto,
    project: ProjectDocument | null,
    actor: Actor,
  ): Promise<ReleaseFeedbackDto> {
    const department = dto.department?.trim();
    if (!department) throw new BadRequestException('department is required.');
    this.assertDepartmentAccess(release, department, project, actor);

    const comment = dto.comment?.trim();
    if (!comment) throw new BadRequestException('comment is required.');

    let parentId: Types.ObjectId | null = null;
    // 답글에는 status가 없다(사용자 확정) — 새 상태를 선언하는 게 아니라 그 상태에 대한
    // 대화이기 때문이다. 최상위 댓글만 status를 가지고, 고르지 않으면 accepted(초록)다.
    let status: (typeof RELEASE_FEEDBACK_STATUSES)[number] | null = null;

    if (dto.parentId) {
      const parent = await this.model.findById(dto.parentId).exec();
      if (!parent || parent.releaseId.toString() !== release._id.toString() || parent.department !== department) {
        throw new BadRequestException('parentId does not belong to this release/department.');
      }
      parentId = parent._id;
    } else {
      status = dto.status ?? 'accepted';
      if (!RELEASE_FEEDBACK_STATUSES.includes(status)) {
        throw new BadRequestException('status must be one of accepted, partial, blocked.');
      }
    }

    const created = await this.model.create({
      releaseId: release._id as Types.ObjectId,
      department,
      parentId,
      status,
      comment,
      createdBy: actor.knoxId,
      isMock: false,
    });
    return toReleaseFeedbackDto(created);
  }
}
