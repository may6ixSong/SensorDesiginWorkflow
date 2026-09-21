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
import { WorkflowDocument } from '../workflows/schemas/workflow.schema';
import { myDepartments, canEditWorkflow } from '../common/access';

/**
 * release 한 건에 대한 부서별 댓글 스레드(설계서 09장 §4.2~4.3) — 산출물 단위가 아니라
 * release 전체에 대한 것이다(사용자 확정).
 *
 * ★ 이 스레드는 원래 그 department 소속만 읽고 쓸 수 있었다 — 다른 부서에는 존재 자체가
 *   보이지 않아야 한다(사용자 확정). **그 원칙은 지금도 그대로다** — 아래 추가된 두 번째
 *   경로(release를 낸 workflow의 Edit Access)는 "다른 부서"가 아니라 "이 release를 낸
 *   쪽"에게만 열리는 별개의 문이다(05장 §7.1.1, 09장 §4.3 갱신). 그래서 "그 department가
 *   실제로 이 release의 recipient인가"와 "actor가 지금 이 과제에서 그 department
 *   소속이거나, 이 release의 workflow에 Edit Access가 있는가(또는 Admin)"를 매번 확인한다.
 */
@Injectable()
export class ReleaseFeedbackService {
  constructor(
    @InjectModel(ReleaseFeedback.name) private readonly model: Model<ReleaseFeedbackDocument>,
  ) {}

  /** department가 실제로 이 release를 받았는지, actor가 그 department 소속이거나 이
   *  release를 낸 workflow의 Edit Access가 있는지(Admin 예외) 확인한다. */
  private assertDepartmentAccess(
    release: ReleaseDocument,
    department: string,
    project: ProjectDocument | null,
    workflow: WorkflowDocument | null,
    actor: Actor,
  ) {
    if (!(release.recipientDepartments ?? []).includes(department)) {
      throw new BadRequestException('That department did not receive this release.');
    }
    const isDeptMember = myDepartments(actor, project).includes(department);
    const isReleasingWorkflowEditor = canEditWorkflow(actor, workflow, project);
    if (!actor.isAdmin && !isDeptMember && !isReleasingWorkflowEditor) {
      throw new ForbiddenException(
        'You are not a member of that department on this project, and do not have Edit Access to the workflow that released this.',
      );
    }
  }

  async listForRelease(
    release: ReleaseDocument,
    department: string,
    project: ProjectDocument | null,
    workflow: WorkflowDocument | null,
    actor: Actor,
  ): Promise<ReleaseFeedbackDto[]> {
    this.assertDepartmentAccess(release, department, project, workflow, actor);
    const docs = await this.model
      .find({ releaseId: release._id, department })
      .sort({ createdAt: 1 })
      .exec();
    return docs.map(toReleaseFeedbackDto);
  }

  /**
   * release를 낸 workflow 쪽에서 **모든 recipient 부서**의 스레드를 한 번에 모아본다
   * (설계서 05장 §7.1.1 — workflow가 여러 부서의 상태를 한눈에 모아보는 대시보드).
   * 호출부(releases.controller.ts)가 이미 workflow Edit Access(또는 Admin)를 확인한
   * 뒤에만 부른다 — 여기서는 그 전제를 다시 검증하지 않고, department별로 묶어서 돌려주는
   * 조회만 한다.
   */
  async listAllForRelease(release: ReleaseDocument): Promise<Record<string, ReleaseFeedbackDto[]>> {
    const departments = release.recipientDepartments ?? [];
    if (!departments.length) return {};
    const docs = await this.model
      .find({ releaseId: release._id, department: { $in: departments } })
      .sort({ createdAt: 1 })
      .exec();
    const byDept: Record<string, ReleaseFeedbackDto[]> = {};
    for (const dept of departments) byDept[dept] = [];
    for (const doc of docs) {
      (byDept[doc.department] ??= []).push(toReleaseFeedbackDto(doc));
    }
    return byDept;
  }

  async createForRelease(
    release: ReleaseDocument,
    dto: CreateReleaseFeedbackDto,
    project: ProjectDocument | null,
    workflow: WorkflowDocument | null,
    actor: Actor,
  ): Promise<ReleaseFeedbackDto> {
    const department = dto.department?.trim();
    if (!department) throw new BadRequestException('department is required.');
    this.assertDepartmentAccess(release, department, project, workflow, actor);

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
