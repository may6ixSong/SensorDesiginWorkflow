import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Workflow, WorkflowDocument, WorkflowPhase } from './schemas/workflow.schema';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import { newSpanId, normalizeSchedule, sortSchedule } from '../common/schedule';
import { CreateWorkflowDto, UpdateWorkflowDto, WorkflowPhaseItemDto } from './dto/workflow-crud.dto';

/** 새 workflow가 색을 고르지 않았을 때 도는 팔레트 — 화면에서 서로 구분되는 값들. */
const COLOR_CYCLE = [
  '#0c9a83', '#5849cf', '#2563c9', '#ac6f08', '#c8352c',
  '#3aa66b', '#b3521e', '#7a4fbf', '#0891b2', '#be185d',
];

@Injectable()
export class WorkflowsService {
  constructor(
    @InjectModel(Workflow.name) private readonly model: Model<WorkflowDocument>,
    private readonly audit: AuditService,
  ) {}

  /**
   * 과제 소속 workflow 전체를 반환한다. 개인 접근 권한으로 필터링하지 않는다 -
   * 무엇을 보여줄지는 web이 응답의 owners/viewGrants와 사용자 Group(Admin이면 super)으로
   * 판단한다 (2026-08-25 결정, src/common/guards/workflow-access.guard.ts 참고).
   *
   * 정렬하지 않고 등록 순서를 유지한다 — 시드의 workflow 배열 순서가 곧 화면상의
   * select 순서이자 기본 선택 workflow다.
   */
  async listAccessibleForProject(projectId: string, _knoxId: string) {
    return this.model.find({ projectId }).exec();
  }

  /**
   * 과제 소속 workflow 전체를 가볍게(id/name/color) 반환한다 — 산출물 수신 workflow
   * (recvWorkflowId)를 지정하는 셀렉트 박스용. listAccessibleForProject와 달리
   * 조회자의 개인 접근 권한으로 필터링하지 않는다: 담당자가 산출물을 넘겨줄 대상을
   * 고를 때, 자신이 view 권한을 갖지 않은 다른 담당자의 workflow도 후보에 있어야 한다.
   */
  async listDirectoryForProject(projectId: string) {
    const workflows = await this.model.find({ projectId }).exec();
    return workflows.map((w) => ({ id: w._id.toString(), name: w.name, color: w.color }));
  }

  /**
   * GET /projects 가 반환할 과제 목록 - workflow를 하나라도 가진 모든 과제.
   * 개인 접근 권한으로 좁히지 않는다 (위 listAccessibleForProject와 동일한 정책).
   */
  async distinctAccessibleProjectIds(_knoxId: string) {
    const ids = await this.model.distinct('projectId', {});
    return ids as Types.ObjectId[];
  }

  async findOrThrow(workflowId: string) {
    const workflow = await this.model.findById(workflowId).exec();
    if (!workflow) throw new NotFoundException('Workflow not found.');
    return workflow;
  }

  async countForProject(projectId: string) {
    return this.model.countDocuments({ projectId }).exec();
  }

  /**
   * workflow 생성. phase는 인자로 받지 않고 반드시 과제 마일스톤의 복사본으로 시작한다 —
   * 도메인 아래에 workflow를 만들면 "default로 과제 일정이 들어간다"는 규칙(사용자 요청)이
   * 여기 한 곳에만 있어야 나중에 어긋나지 않는다. 마일스톤 id를 그대로 재사용하지 않고
   * 새 id를 발급하는 것이 중요하다: 그래야 나중에 과제 마일스톤이 바뀌거나 지워져도
   * 이 workflow의 phase와 그걸 가리키는 산출물이 전혀 영향을 받지 않는다.
   */
  async create(
    projectId: Types.ObjectId,
    milestones: { id: string; name: string; start: string; end: string }[],
    dto: CreateWorkflowDto,
    actor: Actor,
  ) {
    const name = dto.name.trim();
    const duplicate = await this.model.findOne({ projectId, name }).exec();
    if (duplicate) throw new BadRequestException(`A workflow named '${name}' already exists in this project.`);

    const count = await this.model.countDocuments({ projectId }).exec();
    const workflow = await this.model.create({
      projectId,
      name,
      domain: dto.domain.trim(),
      description: dto.description?.trim() ?? '',
      color: dto.color ?? COLOR_CYCLE[count % COLOR_CYCLE.length],
      phases: this.copyMilestonesToPhases(milestones),
      // 만든 사람이 곧 대표 담당자 — 그렇지 않으면 아무도 편집할 수 없는 workflow가 생긴다.
      owners: [actor.knoxId],
      viewGrants: [],
      isMock: false,
    });
    await this.audit.log(actor.knoxId, 'WORKFLOW_CREATE', 'workflow', workflow._id, {
      name, domain: workflow.domain, phaseCount: workflow.phases.length,
    });
    return workflow;
  }

  /** 과제 마일스톤 → 이 workflow만의 phase 복사본 (id는 새로 발급). */
  copyMilestonesToPhases(
    milestones: { name: string; start: string; end: string }[],
  ): WorkflowPhase[] {
    return sortSchedule(
      milestones.map((m) => ({ id: newSpanId('ph'), name: m.name, start: m.start, end: m.end })),
    ) as WorkflowPhase[];
  }

  async updateMeta(workflowId: string, dto: UpdateWorkflowDto, actor: Actor) {
    const workflow = await this.findOrThrow(workflowId);
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const duplicate = await this.model.findOne({ projectId: workflow.projectId, name }).exec();
      if (duplicate && duplicate._id.toString() !== workflow._id.toString()) {
        throw new BadRequestException(`A workflow named '${name}' already exists in this project.`);
      }
      workflow.name = name;
    }
    if (dto.description !== undefined) workflow.description = dto.description.trim();
    if (dto.color !== undefined) workflow.color = dto.color;
    await workflow.save();
    await this.audit.log(actor.knoxId, 'WORKFLOW_UPDATE', 'workflow', workflow._id, dto as any);
    return this.findOrThrow(workflowId);
  }

  /**
   * 이 workflow의 phase 목록을 통째로 교체한다.
   *
   * ★ 사라진 phase를 가리키던 산출물은 절대 건드리지 않는다(사용자 요청) — 옮기지도,
   *   지우지도, phaseId를 비우지도 않는다. 산출물은 캔버스의 원래 좌표에 그대로 남고,
   *   FE가 "이 phaseId는 지금 phase 목록에 없다"는 사실만으로 유실 표시를 그린다. 그래서
   *   같은 id의 phase를 다시 만들어 주면 자동으로 원래대로 붙는다.
   */
  async updatePhases(workflowId: string, input: WorkflowPhaseItemDto[], actor: Actor) {
    const workflow = await this.findOrThrow(workflowId);
    const next = normalizeSchedule(input, 'Phase', 'ph', (m) => {
      throw new BadRequestException(m);
    });

    const before = new Set((workflow.phases ?? []).map((p) => p.id));
    const after = new Set(next.map((p) => p.id));
    // 목록에 없던 id를 클라이언트가 만들어 보내는 것은 허용한다(빈 id면 서버가 발급).
    const removed = [...before].filter((id) => !after.has(id));

    workflow.phases = next as WorkflowPhase[];
    await workflow.save();
    await this.audit.log(actor.knoxId, 'WORKFLOW_PHASES_UPDATE', 'workflow', workflow._id, {
      phaseCount: next.length,
      removedPhaseIds: removed,
    });
    return this.findOrThrow(workflowId);
  }

  /**
   * workflow의 부서(domain)를 바꾼다. 빈 문자열은 "미지정"(FE에서 UNASSIGNED)으로 허용한다.
   *
   * 이 값이 요청한 사람 본인이 속한 부서(Project.members)인지는 여기서 검증하지 않는다 -
   * WorkflowsModule에는 Project 모델이 없고, 여기에 등록하면 인메모리 모드에서 별개의 가짜
   * 컬렉션이 하나 더 생겨 버린다(src/database/model-registration.ts). 그래서 검증은
   * 두 모델을 모두 가진 ProjectsService.updateWorkflowDomain이 하고, 이 메서드는 쓰기만 한다.
   */
  async setDomain(workflowId: string, domain: string, actor: Actor) {
    const workflow = await this.findOrThrow(workflowId);
    const before = workflow.domain ?? '';
    if (before !== domain) {
      workflow.domain = domain;
      await workflow.save();
      await this.audit.log(actor.knoxId, 'WORKFLOW_DOMAIN_SET', 'workflow', workflow._id, { before, after: domain });
    }
    return this.findOrThrow(workflowId);
  }

  /**
   * Edit 권한(owners)은 반드시 Analog 부서 소속만 가능 (설계서 3.3, 4.5, 7.2).
   * api는 사용자의 소속을 조회할 수 없으므로 요청이 함께 보낸 department로 검증한다.
   */
  async addOwner(workflowId: string, knoxId: string, department: string, actor: Actor) {
    if (department !== 'analog') {
      throw new BadRequestException('Only Analog department members can have Edit access.');
    }
    const workflow = await this.findOrThrow(workflowId);
    if (!workflow.owners.includes(knoxId)) {
      workflow.owners.push(knoxId);
      await workflow.save();
      await this.audit.log(actor.knoxId, 'WORKFLOW_OWNER_ADD', 'workflow', workflow._id, { knoxId });
    }
    return this.findOrThrow(workflowId);
  }

  /** 대표 담당자(owners[0])는 삭제 불가 (설계서 5.2). */
  async removeOwner(workflowId: string, knoxId: string, actor: Actor) {
    const workflow = await this.findOrThrow(workflowId);
    if (workflow.owners.length > 0 && workflow.owners[0] === knoxId) {
      throw new ForbiddenException('The primary owner cannot be removed.');
    }
    workflow.owners = workflow.owners.filter((o) => o !== knoxId);
    await workflow.save();
    await this.audit.log(actor.knoxId, 'WORKFLOW_OWNER_REMOVE', 'workflow', workflow._id, { knoxId });
    return this.findOrThrow(workflowId);
  }

  async addViewGrant(workflowId: string, knoxId: string, department: string, actor: Actor) {
    const workflow = await this.findOrThrow(workflowId);
    if (!workflow.viewGrants.some((g) => g.knoxId === knoxId)) {
      workflow.viewGrants.push({ knoxId, department, grantedAt: new Date() });
      await workflow.save();
      await this.audit.log(actor.knoxId, 'WORKFLOW_VIEW_GRANT_ADD', 'workflow', workflow._id, { knoxId, department });
    }
    return this.findOrThrow(workflowId);
  }

  async removeViewGrant(workflowId: string, knoxId: string, actor: Actor) {
    const workflow = await this.findOrThrow(workflowId);
    workflow.viewGrants = workflow.viewGrants.filter((g) => g.knoxId !== knoxId);
    await workflow.save();
    await this.audit.log(actor.knoxId, 'WORKFLOW_VIEW_GRANT_REMOVE', 'workflow', workflow._id, { knoxId });
    return this.findOrThrow(workflowId);
  }
}
