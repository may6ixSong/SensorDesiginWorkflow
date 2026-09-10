import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Workflow, WorkflowDocument, WorkflowPhase } from './schemas/workflow.schema';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import { newSpanId, normalizeSchedule, sortSchedule } from '../common/schedule';
import { CreateWorkflowDto, UpdateWorkflowDto, WorkflowPhaseItemDto } from './dto/workflow-crud.dto';
import { normalizeGrant, pinWorkflowDepartment, swapWorkflowDepartment } from '../common/access';
import { CANVAS_LOCK_TTL_MS, isLockExpired, lockExpiryFrom } from '../common/constants/lock';

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
   * 과제 소속 workflow **전체**를 반환한다 — 개인 접근 권한으로 걸러내지 않는다.
   *
   * 걸러내지 않는 이유는 Information page가 **권한 없는 workflow도 목록에는 보여주되
   * disabled로 그려야** 하기 때문이다(설계서 01장 §3.7). 대신 응답 DTO가 각 항목에
   * `myAccess`를 실어 보내고, app bar의 select는 그 값이 null인 것을 option에서 뺀다.
   *
   * ★ 마스킹은 그대로 유지된다 — 권한 없는 workflow의 캔버스·버전은 애초에 응답에 담기지
   *   않는다. 여기서 내려주는 것은 "그런 workflow가 있다"는 사실과 이름뿐이다.
   *
   * 정렬하지 않고 등록 순서를 유지한다 — 그 순서가 곧 화면상의 select 순서다.
   */
  async listForProject(projectId: string | Types.ObjectId) {
    return this.model.find({ projectId }).exec();
  }

  async findOrThrow(workflowId: string) {
    const workflow = await this.model.findById(workflowId).exec();
    if (!workflow) throw new NotFoundException('Workflow not found.');
    return workflow;
  }

  async countForProject(projectId: string | Types.ObjectId) {
    return this.model.countDocuments({ projectId }).exec();
  }

  /**
   * workflow 생성.
   *
   * ★ department는 필수다 — 예전의 'unassigned'는 폐지되었다. 생성자가 그 과제에서 속한
   *   부서 중 하나여야 하며(Admin은 전체 중), 그 검증은 두 모델을 모두 가진
   *   ProjectsService가 하고 여기서는 이미 검증된 값을 받는다.
   * ★ 생성자가 그대로 **Owner**가 된다(정확히 1명, 이양 불가).
   * ★ 그 department가 **editAccess.departments에 자동으로 들어간다**(설계서 01장 §3.4).
   *   이 항목은 이후 삭제할 수 없고, department 변경으로만 교체된다.
   *
   * phase는 인자로 받지 않고 반드시 과제 마일스톤의 복사본으로 시작한다. 마일스톤 id를
   * 재사용하지 않고 새 id를 발급하는 것이 중요하다 — 그래야 나중에 과제 마일스톤이
   * 바뀌거나 지워져도 이 workflow의 phase와 그걸 가리키는 블록이 영향받지 않는다.
   */
  async create(
    projectId: Types.ObjectId,
    milestones: { id: string; name: string; start: string; end: string }[],
    dto: CreateWorkflowDto,
    actor: Actor,
  ) {
    const name = dto.name.trim();
    const department = dto.department.trim();
    if (!department) throw new BadRequestException('A workflow must belong to a department.');

    const duplicate = await this.model.findOne({ projectId, name }).exec();
    if (duplicate) throw new BadRequestException(`A workflow named '${name}' already exists in this project.`);

    const count = await this.model.countDocuments({ projectId }).exec();
    const workflow = await this.model.create({
      projectId,
      name,
      description: dto.description?.trim() ?? '',
      department,
      ownerKnoxId: actor.knoxId,
      editAccess: { departments: [department], users: [] },
      viewAccess: { departments: [], users: [] },
      color: dto.color ?? COLOR_CYCLE[count % COLOR_CYCLE.length],
      phases: this.copyMilestonesToPhases(milestones),
      phaseWidths: {},
      canvasLock: null,
      releaseSeq: 0,
      isMock: false,
    });
    await this.audit.log(actor.knoxId, 'WORKFLOW_CREATE', 'workflow', workflow._id, { department });
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

  /**
   * Name / Description / Department를 **한 번에** 저장한다(설계서 02장 §7.2).
   *
   * Department가 바뀌면 여기서 한 트랜잭션처럼 세 가지를 처리한다:
   *   1) editAccess.departments 에서 이전 department 제거
   *   2) editAccess.departments 에 새 department 추가
   *   3) department 필드 갱신
   * **그 밖의 것은 절대 건드리지 않는다** — 다른 부서, 개별 사용자, viewAccess 전부 그대로.
   * 새 department가 이미 viewAccess에 있어도 제거하지 않는다(동시 등록 허용).
   *
   * ★ 이 PATCH는 canvasLock을 확인하지도, 건드리지도 않는다 — lock의 범위는 캔버스뿐이라
   *   누가 캔버스를 편집 중이어도 description은 얼마든지 바뀔 수 있다(설계서 03장 §3.3).
   */
  async updateMeta(workflowId: string, dto: UpdateWorkflowDto, actor: Actor) {
    const workflow = await this.findOrThrow(workflowId);

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('A workflow name is required.');
      const duplicate = await this.model.findOne({ projectId: workflow.projectId, name }).exec();
      if (duplicate && duplicate._id.toString() !== workflow._id.toString()) {
        throw new BadRequestException(`A workflow named '${name}' already exists in this project.`);
      }
      workflow.name = name;
    }

    if (dto.description !== undefined) workflow.description = dto.description.trim();
    if (dto.color !== undefined) workflow.color = dto.color;

    if (dto.department !== undefined) {
      const next = dto.department.trim();
      if (!next) throw new BadRequestException('A workflow must belong to a department.');
      const previous = workflow.department;
      if (next !== previous) {
        workflow.editAccess = swapWorkflowDepartment(workflow.editAccess, previous, next);
        workflow.department = next;
        await this.audit.log(actor.knoxId, 'WORKFLOW_DEPARTMENT_CHANGE', 'workflow', workflow._id, {
          from: previous,
          to: next,
        });
      }
    }

    await workflow.save();
    return this.findOrThrow(workflowId);
  }

  /**
   * 권한 한 벌 통째 교체 (설계서 02장 §7.2).
   *
   * ★ workflow 소속 부서의 Edit Access 항목은 **삭제할 수 없다 — Admin도 불가**하다.
   *   클라이언트가 그 항목을 뺀 채로 보내도 서버가 다시 넣는다(설계서 01장 §3.4).
   * ★ Edit과 View **동시 등록을 허용**한다 — 어느 쪽도 상대에서 제거하지 않는다.
   *   실효 권한은 판정 시점에 Edit이 우선한다(common/access.ts grantLevel).
   */
  async replaceAccess(
    workflowId: string,
    input: {
      editAccess?: { departments?: string[]; users?: string[] };
      viewAccess?: { departments?: string[]; users?: string[] };
    },
    actor: Actor,
  ) {
    const workflow = await this.findOrThrow(workflowId);
    workflow.editAccess = pinWorkflowDepartment(input.editAccess, workflow.department);
    workflow.viewAccess = normalizeGrant(input.viewAccess);
    await workflow.save();
    await this.audit.log(actor.knoxId, 'WORKFLOW_ACCESS_REPLACE', 'workflow', workflow._id, {
      editAccess: workflow.editAccess,
      viewAccess: workflow.viewAccess,
    });
    return this.findOrThrow(workflowId);
  }

  /**
   * 이 workflow의 phase 목록을 통째로 교체한다.
   *
   * ★ 사라진 phase를 가리키던 블록은 절대 건드리지 않는다 — 옮기지도, 지우지도, phaseId를
   *   비우지도 않는다. 블록은 캔버스의 원래 좌표에 그대로 남고, FE가 "이 phaseId는 지금
   *   목록에 없다"는 사실만으로 유실 표시를 그린다. 같은 id의 phase를 다시 만들어 주면
   *   자동으로 원래대로 붙는다.
   * ★ 이 PATCH도 canvasLock과 무관하다(위 updateMeta와 같은 이유).
   */
  async updatePhases(workflowId: string, input: WorkflowPhaseItemDto[], _actor: Actor) {
    const workflow = await this.findOrThrow(workflowId);
    const next = normalizeSchedule(input, 'Phase', 'ph', (m) => {
      throw new BadRequestException(m);
    });
    workflow.phases = next as WorkflowPhase[];
    await workflow.save();
    return this.findOrThrow(workflowId);
  }

  /* ---------------------------------------------------------------- *
   * 캔버스 편집 lock (설계서 03장 §3)
   * ---------------------------------------------------------------- */

  /**
   * 점유 또는 갱신. 이미 내가 들고 있으면 만료 시각만 뒤로 민다(하트비트).
   *
   * ★ **`canvasLock` 필드만 원자적으로 $set 한다** — 문서 전체를 다시 쓰지 않는다.
   *   그래서 같은 시각에 다른 사람이 name/description을 PATCH해도 서로 덮어쓰지 않는다.
   * ★ 만료된 lock은 자유롭게 가져갈 수 있다. 남이 들고 있고 아직 살아 있으면 409다.
   */
  async acquireCanvasLock(workflowId: string, actor: Actor) {
    const workflow = await this.findOrThrow(workflowId);
    const current = workflow.canvasLock;
    const now = new Date();

    const heldByOther =
      current && current.holderKnoxId !== actor.knoxId && !isLockExpired(current.expiresAt, now);
    if (heldByOther) {
      throw new ConflictException({
        message: 'Someone else is editing this canvas.',
        holderKnoxId: current!.holderKnoxId,
        expiresAt: current!.expiresAt,
      });
    }

    const isRenewal = current?.holderKnoxId === actor.knoxId && !isLockExpired(current.expiresAt, now);
    const lock = {
      holderKnoxId: actor.knoxId,
      acquiredAt: isRenewal ? current!.acquiredAt : now,
      expiresAt: lockExpiryFrom(now),
    };

    await this.model.updateOne({ _id: workflow._id }, { $set: { canvasLock: lock } }).exec();
    return { ...lock, ttlMs: CANVAS_LOCK_TTL_MS, renewed: isRenewal };
  }

  /**
   * 해제. 본인만 풀 수 있고, **Admin은 언제든 강제 해제**할 수 있다(설계서 03장 §3.2).
   * 이미 만료된 lock은 누가 요청하든 그냥 지운다.
   */
  async releaseCanvasLock(workflowId: string, actor: Actor) {
    const workflow = await this.findOrThrow(workflowId);
    const current = workflow.canvasLock;
    if (!current) return { released: true };

    const mine = current.holderKnoxId === actor.knoxId;
    const expired = isLockExpired(current.expiresAt);
    if (!mine && !expired && !actor.isAdmin) {
      throw new ConflictException('Only the lock holder or an admin can release this lock.');
    }

    await this.model.updateOne({ _id: workflow._id }, { $set: { canvasLock: null } }).exec();
    if (!mine) {
      await this.audit.log(actor.knoxId, 'CANVAS_LOCK_FORCE_RELEASE', 'workflow', workflow._id, {
        previousHolder: current.holderKnoxId,
      });
    }
    return { released: true };
  }

  /**
   * 캔버스를 저장할 수 있는 상태인지 — `PUT /workflows/:id/canvas` **한 곳에서만** 부른다.
   * 다른 어떤 쓰기도 이 검사를 하지 않는다(설계서 03장 §3.3).
   */
  assertCanvasLockHeldBy(workflow: WorkflowDocument, actor: Actor): void {
    if (actor.isAdmin) return;
    const lock = workflow.canvasLock;
    if (!lock || isLockExpired(lock.expiresAt)) {
      throw new ConflictException('Your editing session has expired. Re-enter edit mode and try again.');
    }
    if (lock.holderKnoxId !== actor.knoxId) {
      throw new ConflictException('Someone else is editing this canvas.');
    }
  }
}
