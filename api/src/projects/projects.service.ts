import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Project, ProjectDocument } from './schemas/project.schema';
import { WorkflowsService } from '../workflows/workflows.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import { DEPARTMENTS } from '../common/constants/departments';
import { canAccessProject, canEditMilestones, myDepartments } from '../common/access';
import { REVISION_FORMAT_MESSAGE, isValidRevision, normalizeRevision } from '../common/constants/revision';
import { normalizeSchedule } from '../common/schedule';
import { Milestone } from './schemas/project.schema';
import { CreateWorkflowDto } from '../workflows/dto/workflow-crud.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private readonly model: Model<ProjectDocument>,
    private readonly workflows: WorkflowsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * 접근 가능한 과제 목록 = **`members`에 등록된 과제**(설계서 01장 §2.1).
   *
   * ★ 이 규칙이 최우선이다 — 어떤 workflow의 View Access를 받았더라도 그 과제의 member가
   *   아니면 목록에 뜨지 않고, 라우팅으로 우회해도 차단된다(§2.2). 반대로 권한 부여 자체는
   *   member 여부와 무관하게 가능하며, 나중에 members에 추가되는 순간 실제로 열린다.
   * ★ Admin은 전부 본다.
   */
  async listAccessibleForUser(actor: Actor) {
    const filter = actor.isAdmin ? {} : { 'members.knoxId': actor.knoxId };
    return this.model.find(filter).sort({ code: 1 }).exec();
  }

  async findByIdOrThrow(id: string) {
    const project = await this.model.findById(id).exec();
    if (!project) throw new NotFoundException('Project not found.');
    return project;
  }

  async getMilestones(id: string) {
    const project = await this.findByIdOrThrow(id);
    return project.milestones ?? [];
  }

  /**
   * 이 과제 아래에 workflow를 새로 만든다. phase는 이 과제의 마일스톤 복사본으로
   * 시작한다(WorkflowsService.create) — 그래서 이 라우트가 ProjectsController에 있다:
   * 마일스톤을 아는 곳은 Project 모델을 가진 여기뿐이다.
   *
   * ★ department는 **필수**다 — 'unassigned'는 폐지되었다(설계서 README §3.2).
   * ★ 후보는 "내가 이 과제에서 속한 부서"뿐이다. 판정 기준은 전사 소속이 아니라 이 과제의
   *   members 로스터다(설계서 01장 §2.4) — 같은 사람이 과제마다 다른 부서일 수 있어서다.
   *   Admin은 그 과제의 전체 부서 중에서 고를 수 있다.
   * ★ 소속 부서가 하나도 없는 사람은 workflow를 만들 수 없다(Admin 제외).
   */
  async createWorkflow(id: string, dto: CreateWorkflowDto, actor: Actor) {
    const project = await this.assertViewAccess(id, actor);

    const candidates = myDepartments(actor, project);
    if (candidates.length === 0) {
      throw new BadRequestException(
        'You must belong to a department in this project to create a workflow.',
      );
    }

    const wanted = (dto.department ?? '').trim();
    if (!wanted) {
      throw new BadRequestException('Select the department this workflow belongs to.');
    }
    // 목록에 등록된 표기를 그대로 저장한다 — 사용자가 'analog'로 보내도 'Analog'로.
    const match = candidates.find((d) => d.trim().toUpperCase() === wanted.toUpperCase());
    if (!match) {
      throw new BadRequestException(`'${wanted}' is not one of your departments in this project.`);
    }

    return this.workflows.create(
      project._id,
      project.milestones ?? [],
      { ...dto, department: match.trim() },
      actor,
    );
  }

  // workflow의 부서 재배정은 더 이상 여기 없다 — Name/Description/Department가 화면의
  // Save 버튼 하나로 묶이면서 `PATCH /workflows/:id` 단일 라우트로 옮겨갔다
  // (WorkflowsService.updateMeta, 설계서 02장 §7.2). 그쪽이 editAccess의 부서 교체까지
  // 한 번에 처리한다.

  /**
   * 과제 마일스톤(공통 일정) 목록을 통째로 교체한다 — 추가/삭제/개명/재일정 전부 가능하다.
   *
   * 예전 Phase와 달리 산출물이 이 id를 직접 가리키지 않는다: 산출물은 workflow의 phase를
   * 가리키고, workflow phase는 생성 시 마일스톤을 "복사"한 별개 id다(WorkflowsService.
   * copyMilestonesToPhases). 그래서 여기서 마일스톤을 지워도 산출물이 고아가 되지 않고,
   * 이미 만들어진 workflow의 일정도 따라 바뀌지 않는다.
   */
  async updateMilestones(
    id: string,
    updates: { id?: string; name: string; start: string; end: string }[],
    actor: Actor,
  ) {
    const project = await this.assertViewAccess(id, actor);
    // 마일스톤은 workflow Edit Access가 아니라 Project Manager role로 판정한다
    // (설계서 01장 §2.3) — Manager가 아니면 편집할 수 없다.
    if (!canEditMilestones(actor, project)) {
      throw new ForbiddenException('Only a project manager can edit milestones.');
    }

    project.milestones = normalizeSchedule(updates, 'Milestone', 'ms', (m) => {
      throw new BadRequestException(m);
    }) as Milestone[];

    await project.save();
    return this.findDetailOrThrow(id);
  }

  /**
   * 이 과제의 부서 목록을 통째로 교체한다. "아직 쓰이는 중이면 삭제 거부" 규칙은 두지
   * 않는다 - 목록에서 부서를 지워도 그 부서를 이미 가진 ProjectMember.departments나
   * Workflow.domain, 산출물의 sourceDept 문자열은 그대로 남는다(전부 자유 텍스트라 이
   * 목록과 강결합되지 않는다) - 다음부터 이 목록(멤버 추가, workflow domain 재배정,
   * "Received from" 후보)에만 안 보이면 된다.
   */
  async updateDepartments(id: string, input: string[], actor: Actor) {
    const project = await this.assertManageAccess(id, actor);

    const next: string[] = [];
    const seen = new Set<string>();
    for (const raw of input) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(name);
    }

    project.departments = next;
    project.departmentsSeeded = true;
    await project.save();
    return this.findDetailOrThrow(id);
  }

  /**
   * Project Manager 추가 — 이 과제의 마일스톤(공통 일정)을 수정할 수 있는 사람.
   * Workflow.addOwner와 같은 패턴이되, 부서 제한은 없다(Manager는 Analog 한정이 아니다).
   */
  async addManager(id: string, knoxId: string, actor: Actor) {
    const project = await this.assertManageAccess(id, actor);
    if (!project.managers.includes(knoxId)) {
      project.managers.push(knoxId);
      await project.save();
      await this.audit.log(actor.knoxId, 'PROJECT_MANAGER_ADD', 'project', project._id, { knoxId });
    }
    return this.findDetailOrThrow(id);
  }

  async removeManager(id: string, knoxId: string, actor: Actor) {
    const project = await this.assertManageAccess(id, actor);
    project.managers = project.managers.filter((m) => m !== knoxId);
    await project.save();
    await this.audit.log(actor.knoxId, 'PROJECT_MANAGER_REMOVE', 'project', project._id, { knoxId });
    return this.findDetailOrThrow(id);
  }

  /**
   * Project Information 페이지 상세 조회.
   * members는 KnoxID만 담으므로 populate 없이 그대로 내려간다 — 이름은 web이
   * SDPCommonAPI로 조회한다(설계서 01장 §6).
   */
  async findDetailOrThrow(id: string) {
    const project = await this.model.findById(id).exec();
    if (!project) throw new NotFoundException('Project not found.');
    return this.ensureDepartments(project);
  }

  /**
   * departments 없이 만들어진(과거) 과제 문서를 처음 만나는 순간 기본 6개 부서로
   * 채워 저장한다 - 별도 마이그레이션 스크립트 없이, 화면에서 한 번이라도 조회되면
   * DB에도 자동 반영되게 하기 위해서다. departmentsSeeded 플래그로 딱 한 번만 채우고,
   * 그 뒤로 사용자가 부서를 전부 지워도(빈 배열) 다시 채우지 않는다.
   */
  private async ensureDepartments(project: ProjectDocument): Promise<ProjectDocument> {
    if (!project.departmentsSeeded) {
      project.departments = DEPARTMENTS.map((d) => d.name);
      project.departmentsSeeded = true;
      await project.save();
    }
    return project;
  }

  /**
   * 과제 열람 게이트 — **members가 아니면 403**이다(설계서 01장 §2.2). 이 게이트가
   * 시스템 전체의 최종 관문이라 여기서 실제로 막는다.
   */
  async assertViewAccess(id: string, actor: Actor): Promise<ProjectDocument> {
    const project = await this.findDetailOrThrow(id);
    if (!canAccessProject(actor, project)) {
      throw new ForbiddenException('You do not have access to this project.');
    }
    return project;
  }

  /**
   * 과제 관리 게이트 — 과제 메타/부서/멤버/Manager 편집은 **Admin만** 한다
   * (설계서 01장 §2.3, 가정 P1).
   */
  private async assertManageAccess(id: string, actor: Actor): Promise<ProjectDocument> {
    const project = await this.assertViewAccess(id, actor);
    if (!actor.isAdmin) {
      throw new ForbiddenException('Only an admin can manage this project.');
    }
    return project;
  }

  /**
   * 과제 메타데이터 수정 — 마일스톤은 updateMilestones가 따로 다룬다.
   *
   * ★ `code`와 `revision`은 **생성 후 수정 절대 불가**다(설계서 README §3.1). 들어오면
   *   조용히 무시하지 않고 **400으로 명시적으로 거부**한다 — 화면에서 disabled로 막는
   *   것과 별개로 서버가 다시 막아야 하고, 무시하면 "저장됐다"고 오해할 수 있다.
   *   바꿔야 하면 Admin이 DB를 직접 고친다.
   */
  async updateProject(
    id: string,
    dto: { name?: string; code?: string; revision?: string; status?: string; meta?: Record<string, string> },
    actor: Actor,
  ) {
    const project = await this.assertManageAccess(id, actor);

    if (dto.code !== undefined || dto.revision !== undefined) {
      throw new BadRequestException(
        'Project code and revision cannot be changed after creation.',
      );
    }

    if (dto.name !== undefined) project.name = dto.name.trim();
    if (dto.status !== undefined) project.status = dto.status;
    if (dto.meta !== undefined) project.meta = dto.meta;

    await project.save();
    return this.findDetailOrThrow(id);
  }

  /**
   * 과제 생성 — **Admin만**(가정 P1). code+revision 조합이 그 과제의 신원이며 이후 수정할 수 없다.
   */
  async createProject(
    dto: { code: string; revision: string; name: string; milestones?: { name: string; start: string; end: string }[] },
    actor: Actor,
  ) {
    if (!actor.isAdmin) throw new ForbiddenException('Only an admin can create a project.');

    const code = dto.code.trim();
    const revision = normalizeRevision(dto.revision ?? '');
    if (!isValidRevision(revision)) throw new BadRequestException(REVISION_FORMAT_MESSAGE);

    const existing = await this.model.findOne({ code, revision }).exec();
    if (existing) throw new BadRequestException('That project code + revision is already in use.');

    const milestones = normalizeSchedule(dto.milestones ?? [], 'Milestone', 'ms', (m) => {
      throw new BadRequestException(m);
    }) as Milestone[];

    const project = await this.model.create({
      code,
      revision,
      name: dto.name.trim(),
      departments: DEPARTMENTS.map((d) => d.name),
      departmentsSeeded: true,
      milestones,
      members: [],
      managers: [],
      meta: {},
      status: 'ACTIVE',
      isMock: false,
    });
    await this.audit.log(actor.knoxId, 'PROJECT_CREATE', 'project', project._id, { code, revision });
    return project;
  }

  /**
   * 과제 팀원 명단(부서별 로스터)에 인원을 추가한다 — Workflow owners/viewGrants(접근 권한)와는
   * 별개 개념. department는 이 과제의 자유 부서 목록(Project.departments)에 있는 값이어야
   * 한다 - 전사 고정 6부서(DEPARTMENTS)는 더 이상 이 명단의 검증 기준이 아니다. 이미 다른
   * 부서에 속한 멤버를 또 다른 부서 카드에서 추가하면 그 부서가 목록에 더해진다(한 멤버가
   * 여러 부서에 속할 수 있다) — 완전히 새 멤버일 때만 새 로스터 항목을 만든다.
   */
  async addMember(id: string, knoxId: string, department: string, actor: Actor) {
    const project = await this.assertManageAccess(id, actor);

    const wanted = department.trim();
    const match = project.departments.find((d) => d.trim().toUpperCase() === wanted.toUpperCase());
    if (!match) {
      throw new BadRequestException(`'${department}' is not one of this project's departments.`);
    }
    const dept = match.trim();

    const existing = project.members.find((m) => m.knoxId === knoxId);
    if (existing) {
      if (!existing.departments.some((d) => d.trim().toUpperCase() === dept.toUpperCase())) {
        existing.departments.push(dept);
        await project.save();
      }
    } else {
      project.members.push({ knoxId, departments: [dept], addedAt: new Date() });
      await project.save();
      await this.audit.log(actor.knoxId, 'PROJECT_MEMBER_ADD', 'project', project._id, { knoxId, department: dept });
    }
    return this.findDetailOrThrow(id);
  }

  /** 멤버를 지정한 부서 카드에서 뺀다 — 그 부서가 마지막 소속이었으면 명단에서 완전히 사라진다. */
  async removeMember(id: string, knoxId: string, department: string, actor: Actor) {
    const project = await this.assertManageAccess(id, actor);

    const member = project.members.find((m) => m.knoxId === knoxId);
    if (member) {
      const wanted = department.trim().toUpperCase();
      member.departments = member.departments.filter((d) => d.trim().toUpperCase() !== wanted);
      if (member.departments.length === 0) {
        project.members = project.members.filter((m) => m.knoxId !== knoxId);
      }
      await project.save();
      await this.audit.log(actor.knoxId, 'PROJECT_MEMBER_REMOVE', 'project', project._id, { knoxId, department });
    }
    return this.findDetailOrThrow(id);
  }
}
