import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Project, ProjectDocument } from './schemas/project.schema';
import { WorkflowsService } from '../workflows/workflows.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import { DEPARTMENTS } from '../common/constants/departments';
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

  /** 접근 가능한 과제 목록 = 하나 이상의 workflow에 Edit/View 권한이 있는 과제 (설계서 5.1). */
  async listAccessibleForUser(knoxId: string) {
    const projectIds = await this.workflows.distinctAccessibleProjectIds(knoxId);
    return this.model.find({ _id: { $in: projectIds } }).sort({ code: 1 }).exec();
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
   * workflow의 부서(domain)는 예전처럼 후보 목록에서 자유롭게 고르는 게 아니라, 만든
   * 사람이 이 과제의 팀원 명단(Project.members)에서 실제로 속한 부서 중 하나여야 한다:
   *  - 소속 부서가 하나도 없는 사람은 workflow를 만들 수 없다. 단, admin은 예외로
   *    허용하되 그렇게 만든 workflow는 unassigned(빈 문자열)로 남는다 — admin 여부는
   *    api가 독립적으로 확인할 수 없어(Actor에는 knoxId만 있다, src/common/actor.ts)
   *    요청이 함께 보낸 creatorIsAdmin을 신뢰한다(addOwner의 department 신뢰와 같은 패턴).
   *  - 소속 부서가 있는 사람은 그중 하나를 반드시 골라야 한다(자기 부서가 아닌 값은 거부).
   */
  async createWorkflow(id: string, dto: CreateWorkflowDto, actor: Actor) {
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);

    const member = project.members.find((m) => m.knoxId === actor.knoxId);
    const memberDepts = member?.departments ?? [];

    let resolved = '';
    if (memberDepts.length === 0) {
      if (!dto.creatorIsAdmin) {
        throw new BadRequestException(
          'You must belong to a department in this project to create a workflow.',
        );
      }
      // admin이면서 소속 부서가 없다 — unassigned(빈 문자열)로 남긴다.
    } else {
      const wanted = dto.domain.trim();
      if (!wanted) {
        throw new BadRequestException("Select one of your departments for this workflow's domain.");
      }
      const match = memberDepts.find((d) => d.trim().toUpperCase() === wanted.toUpperCase());
      if (!match) {
        throw new BadRequestException(`'${wanted}' is not one of your departments in this project.`);
      }
      resolved = match.trim();
    }

    return this.workflows.create(project._id, project.milestones ?? [], { ...dto, domain: resolved }, actor);
  }

  /**
   * Workflow 하나를 부서에 재배정한다. 빈 문자열이면 배정 해제(unassigned).
   *
   * 예전에는 과제의 도메인 후보 목록에서 아무거나 고를 수 있었지만, 이제는 요청한 사람
   * 본인이 이 과제에서 실제로 속한 부서(Project.members) 중 하나여야 한다 — createWorkflow와
   * 같은 신뢰 모델. 이 검증에 Project와 Workflow 모델이 둘 다 필요해 그 둘을 함께 가진
   * 곳(ProjectsController, ProjectsModule이 IpsModule을 import)에 둔다.
   */
  async updateWorkflowDomain(id: string, workflowId: string, domain: string, actor: Actor) {
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);
    const workflow = await this.workflows.findOrThrow(workflowId);
    if (workflow.projectId.toString() !== project._id.toString()) {
      throw new BadRequestException('That Workflow does not belong to this project.');
    }

    const wanted = domain.trim();
    let resolved = '';
    if (wanted) {
      const member = project.members.find((m) => m.knoxId === actor.knoxId);
      const memberDepts = member?.departments ?? [];
      // 목록에 등록된 표기를 그대로 저장한다 - 사용자가 'analog'로 보내도 'Analog'로.
      const match = memberDepts.find((d) => d.trim().toUpperCase() === wanted.toUpperCase());
      if (!match) {
        throw new BadRequestException(`'${wanted}' is not one of your departments in this project.`);
      }
      resolved = match.trim();
    }

    await this.workflows.setDomain(workflowId, resolved, actor);
    return this.findDetailOrThrow(id, actor.knoxId);
  }

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
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);

    project.milestones = normalizeSchedule(updates, 'Milestone', 'ms', (m) => {
      throw new BadRequestException(m);
    }) as Milestone[];

    await project.save();
    return this.findDetailOrThrow(id, actor.knoxId);
  }

  /**
   * 이 과제의 부서 목록을 통째로 교체한다. "아직 쓰이는 중이면 삭제 거부" 규칙은 두지
   * 않는다 - 목록에서 부서를 지워도 그 부서를 이미 가진 ProjectMember.departments나
   * Workflow.domain, 산출물의 sourceDept 문자열은 그대로 남는다(전부 자유 텍스트라 이
   * 목록과 강결합되지 않는다) - 다음부터 이 목록(멤버 추가, workflow domain 재배정,
   * "Received from" 후보)에만 안 보이면 된다.
   */
  async updateDepartments(id: string, input: string[], actor: Actor) {
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);

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
    return this.findDetailOrThrow(id, actor.knoxId);
  }

  /**
   * Project Manager 추가 — 이 과제의 마일스톤(공통 일정)을 수정할 수 있는 사람.
   * Workflow.addOwner와 같은 패턴이되, 부서 제한은 없다(Manager는 Analog 한정이 아니다).
   */
  async addManager(id: string, knoxId: string, actor: Actor) {
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);
    if (!project.managers.includes(knoxId)) {
      project.managers.push(knoxId);
      await project.save();
      await this.audit.log(actor.knoxId, 'PROJECT_MANAGER_ADD', 'project', project._id, { knoxId });
    }
    return this.findDetailOrThrow(id, actor.knoxId);
  }

  async removeManager(id: string, knoxId: string, actor: Actor) {
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);
    project.managers = project.managers.filter((m) => m !== knoxId);
    await project.save();
    await this.audit.log(actor.knoxId, 'PROJECT_MANAGER_REMOVE', 'project', project._id, { knoxId });
    return this.findDetailOrThrow(id, actor.knoxId);
  }

  /**
   * Project Information 페이지 상세 조회. 개인 접근 권한으로 막지 않는다 - 어떤 과제를
   * 보여줄지는 web이 사용자 Group(Admin이면 super)과 workflow의 owners/viewGrants로 판단한다
   * (2026-08-25 결정, src/common/guards/workflow-access.guard.ts 참고).
   * members는 KnoxID만 담으므로 populate 없이 그대로 내려간다.
   */
  async findDetailOrThrow(id: string, _knoxId: string) {
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
   * 과제 열람 게이트 - 현재는 아무것도 막지 않는다. 추후 토큰 인증이 들어오면
   * 여기와 WorkflowAccessGuard 두 곳만 되살리면 서버 차단이 복구된다.
   */
  async assertViewAccess(id: string, _knoxId: string) {
    await this.findByIdOrThrow(id);
  }

  /** 과제 관리 게이트 - 위 assertViewAccess와 동일한 이유로 차단하지 않는다. */
  private async assertManageAccess(id: string, _actor: Actor) {
    await this.findByIdOrThrow(id);
  }

  /** 과제 메타데이터(이름/코드/상태) 수정 — 마일스톤은 updateMilestones가 따로 다룬다. */
  async updateProject(
    id: string,
    dto: { name?: string; code?: string; status?: string },
    actor: Actor,
  ) {
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);

    if (dto.code !== undefined && dto.code !== project.code) {
      const existing = await this.model.findOne({ code: dto.code }).exec();
      if (existing && existing._id.toString() !== project._id.toString()) {
        throw new BadRequestException('That project code is already in use.');
      }
      project.code = dto.code;
    }
    if (dto.name !== undefined) project.name = dto.name;
    if (dto.status !== undefined) project.status = dto.status;

    await project.save();
    return this.findDetailOrThrow(id, actor.knoxId);
  }

  /**
   * 과제 팀원 명단(부서별 로스터)에 인원을 추가한다 — Workflow owners/viewGrants(접근 권한)와는
   * 별개 개념. department는 이 과제의 자유 부서 목록(Project.departments)에 있는 값이어야
   * 한다 - 전사 고정 6부서(DEPARTMENTS)는 더 이상 이 명단의 검증 기준이 아니다. 이미 다른
   * 부서에 속한 멤버를 또 다른 부서 카드에서 추가하면 그 부서가 목록에 더해진다(한 멤버가
   * 여러 부서에 속할 수 있다) — 완전히 새 멤버일 때만 새 로스터 항목을 만든다.
   */
  async addMember(id: string, knoxId: string, department: string, actor: Actor) {
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);

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
    return this.findDetailOrThrow(id, actor.knoxId);
  }

  /** 멤버를 지정한 부서 카드에서 뺀다 — 그 부서가 마지막 소속이었으면 명단에서 완전히 사라진다. */
  async removeMember(id: string, knoxId: string, department: string, actor: Actor) {
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);

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
    return this.findDetailOrThrow(id, actor.knoxId);
  }
}
