import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Project, ProjectDocument } from './schemas/project.schema';
import { WorkflowsService } from '../workflows/workflows.service';
import { AuditService } from '../audit/audit.service';
import { Actor } from '../common/actor';
import { DEPARTMENTS, isValidDepartment } from '../common/constants/departments';
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
   * 이 과제 도메인 아래에 workflow를 새로 만든다. phase는 이 과제의 마일스톤 복사본으로
   * 시작한다(WorkflowsService.create) — 그래서 이 라우트가 ProjectsController에 있다:
   * 마일스톤을 아는 곳은 Project 모델을 가진 여기뿐이다.
   */
  async createWorkflow(id: string, dto: CreateWorkflowDto, actor: Actor) {
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);

    const wanted = dto.domain.trim();
    let resolved = '';
    if (wanted) {
      const match = (project.workflowDomains ?? []).find(
        (d) => d.trim().toUpperCase() === wanted.toUpperCase(),
      );
      if (!match) {
        throw new BadRequestException(`'${wanted}' is not one of this project's design domains.`);
      }
      resolved = match.trim();
    }

    return this.workflows.create(project._id, project.milestones ?? [], { ...dto, domain: resolved }, actor);
  }

  /**
   * 이 과제의 Workflow 도메인 후보 목록을 통째로 교체한다.
   *
   * 정규화: 앞뒤 공백 제거 → 빈 값 제외 → 대소문자 무시 중복 제거(첫 표기를 남긴다).
   * FE의 domainOf()가 대문자로 올려 묶으므로(web/src/lib/domainWorkflow.ts) 'Analog'와
   * 'ANALOG'가 목록에 같이 있으면 화면에서 한 항성계로 합쳐져 목록과 어긋난다.
   *
   * 아직 workflow가 붙어 있는 도메인은 지울 수 없다 - 지우면 그 workflow의 domain 값만 목록에서
   * 사라진 채 남아(orphan) 화면에는 계속 도메인으로 뜨는데 목록에서는 안 보이게 된다.
   */
  async updateWorkflowDomains(id: string, input: string[], actor: Actor) {
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

    const removed = (project.workflowDomains ?? []).filter((d) => !seen.has(d.trim().toUpperCase()));
    if (removed.length > 0) {
      const removedKeys = new Set(removed.map((d) => d.trim().toUpperCase()));
      const workflows = await this.workflows.listAccessibleForProject(id, actor.knoxId);
      const blocked = workflows.filter((workflow) => removedKeys.has((workflow.domain ?? '').trim().toUpperCase()));
      if (blocked.length > 0) {
        throw new BadRequestException(
          `Reassign these Workflows before removing that domain: ${blocked.map((workflow) => workflow.name).join(', ')}`,
        );
      }
    }

    project.workflowDomains = next;
    await project.save();
    await this.audit.log(actor.knoxId, 'PROJECT_WORKFLOW_DOMAINS_UPDATE', 'project', project._id, {
      workflowDomains: next,
    });
    return this.findDetailOrThrow(id, actor.knoxId);
  }

  /**
   * Workflow 하나를 이 과제의 도메인 중 하나에 배정한다. 빈 문자열이면 배정 해제.
   *
   * 라우트가 /workflows/:workflowId 가 아니라 /projects/:id/workflows/:workflowId/domain 인 이유: 후보 목록이
   * 과제에 있어서 검증에 Project와 Workflow 모델이 둘 다 필요한데, 그 둘을 함께 가진 곳은
   * ProjectsController(ProjectsModule이 IpsModule을 import)뿐이다. 반대 방향으로 붙이면
   * IpsModule에 Project 모델을 중복 등록해야 하고, 인메모리 모드에서 가짜 컬렉션이
   * 두 개로 갈린다(src/database/model-registration.ts).
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
      // 목록에 등록된 표기를 그대로 저장한다 - 사용자가 'analog'로 보내도 'Analog'로.
      const match = (project.workflowDomains ?? []).find(
        (d) => d.trim().toUpperCase() === wanted.toUpperCase(),
      );
      if (!match) {
        throw new BadRequestException(`'${wanted}' is not one of this project's design domains.`);
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
    await this.audit.log(actor.knoxId, 'PROJECT_MILESTONES_UPDATE', 'project', project._id, {
      milestoneCount: project.milestones.length,
    });
    return this.findDetailOrThrow(id, actor.knoxId);
  }

  /**
   * 이 과제의 부서 목록을 통째로 교체한다(workflowDomains와 같은 방식). workflowDomains와
   * 달리 "아직 쓰이는 중이면 삭제 거부" 규칙은 두지 않는다 - 이 목록은 권한/소속을 결정하는
   * 값이 아니라 산출물 전달 화면의 후보 라벨일 뿐이라, 이미 어떤 산출물이 특정 부서명을
   * sourceDept로 들고 있어도 그 문자열은 그대로 남고(자유 텍스트라 이 목록과 강결합되지
   * 않는다) 다음부터 후보 목록에만 안 보이면 된다.
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
    await this.audit.log(actor.knoxId, 'PROJECT_DEPARTMENTS_UPDATE', 'project', project._id, {
      departments: next,
    });
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
    await this.audit.log(actor.knoxId, 'PROJECT_UPDATE', 'project', project._id, dto);
    return this.findDetailOrThrow(id, actor.knoxId);
  }

  /** 과제 팀원 명단(부서별 로스터)에 인원을 추가한다 — Workflow owners/viewGrants(접근 권한)와는 별개 개념. */
  async addMember(id: string, knoxId: string, department: string, actor: Actor) {
    if (!isValidDepartment(department)) {
      throw new BadRequestException('Unknown department.');
    }
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);
    if (!project.members.some((m) => m.knoxId === knoxId)) {
      project.members.push({ knoxId, department, addedAt: new Date() });
      await project.save();
      await this.audit.log(actor.knoxId, 'PROJECT_MEMBER_ADD', 'project', project._id, { knoxId, department });
    }
    return this.findDetailOrThrow(id, actor.knoxId);
  }

  async removeMember(id: string, knoxId: string, actor: Actor) {
    await this.assertManageAccess(id, actor);
    const project = await this.findByIdOrThrow(id);
    project.members = project.members.filter((m) => m.knoxId !== knoxId);
    await project.save();
    await this.audit.log(actor.knoxId, 'PROJECT_MEMBER_REMOVE', 'project', project._id, { knoxId });
    return this.findDetailOrThrow(id, actor.knoxId);
  }
}
