import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { Actor } from '../common/actor';
import { ProjectsService } from './projects.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { toWorkflowDto } from '../workflows/dto/workflow.dto';
import { toProjectDetailDto } from './dto/project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { AddProjectManagerDto } from './dto/manage-project-managers.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdateMilestonesDto } from './dto/update-milestones.dto';
import { UpdateProjectDepartmentsDto } from './dto/update-project-departments.dto';
import { CreateWorkflowDto } from '../workflows/dto/workflow-crud.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { workflowLevel } from '../common/access';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly workflows: WorkflowsService,
  ) {}

  /**
   * 접근 가능한 과제 목록 — **members에 등록된 것만**(설계서 01장 §2.1). Admin은 전부 본다.
   */
  @Get()
  async list(@CurrentActor() me: Actor) {
    const projects = await this.projects.listAccessibleForUser(me);
    return { data: projects.map(toProjectDetailDto) };
  }

  /** 과제 생성 — Admin만(가정 P1). code/revision은 이후 수정할 수 없다. */
  @Post()
  async create(@Body() body: CreateProjectDto, @CurrentActor() me: Actor) {
    const project = await this.projects.createProject(body, me);
    return { data: toProjectDetailDto(project) };
  }

  /** Project Information 페이지용 상세 조회(마일스톤 + 부서별 팀원 로스터). */
  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentActor() me: Actor) {
    const project = await this.projects.assertViewAccess(id, me);
    return { data: toProjectDetailDto(project) };
  }

  @Get(':id/milestones')
  async milestones(@Param('id') id: string, @CurrentActor() me: Actor) {
    const project = await this.projects.assertViewAccess(id, me);
    return { data: project.milestones ?? [] };
  }

  /** 과제 공통 일정(마일스톤) 목록 교체 — 추가/삭제/개명/재일정 전부 가능하다. */
  @Patch(':id/milestones')
  async updateMilestones(
    @Param('id') id: string,
    @Body() body: UpdateMilestonesDto,
    @CurrentActor() me: Actor,
  ) {
    const project = await this.projects.updateMilestones(id, body.milestones, me);
    return { data: toProjectDetailDto(project) };
  }

  /** Project Manager 추가 — 마일스톤(공통 일정)을 수정할 수 있는 사람. */
  @Post(':id/managers')
  async addManager(@Param('id') id: string, @Body() body: AddProjectManagerDto, @CurrentActor() me: Actor) {
    const project = await this.projects.addManager(id, body.knoxId, me);
    return { data: toProjectDetailDto(project) };
  }

  @Delete(':id/managers/:knoxId')
  async removeManager(
    @Param('id') id: string,
    @Param('knoxId') knoxId: string,
    @CurrentActor() me: Actor,
  ) {
    const project = await this.projects.removeManager(id, knoxId, me);
    return { data: toProjectDetailDto(project) };
  }

  // workflow 부서 재배정 라우트는 사라졌다 — Name/Description/Department가 화면의 Save
  // 버튼 하나로 묶이면서 `PATCH /workflows/:id` 로 옮겨갔다(설계서 02장 §7.2).

  /**
   * 이 과제의 부서 목록 교체(추가/삭제 자유) — 산출물 "Received from" 화면의 후보 목록.
   * @Patch(':id')보다 위에 있어야 한다 - 아래에 두면 ':id'가 'departments'까지 먹는다.
   */
  @Patch(':id/departments')
  async updateDepartments(
    @Param('id') id: string,
    @Body() body: UpdateProjectDepartmentsDto,
    @CurrentActor() me: Actor,
  ) {
    const project = await this.projects.updateDepartments(id, body.departments, me);
    return { data: toProjectDetailDto(project) };
  }

  /**
   * 과제 메타데이터 수정 — **Admin만**(설계서 01장 §2.3).
   * `code`/`revision`이 들어오면 400으로 거부한다 — 생성 후 수정 불가다.
   */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateProjectDto, @CurrentActor() me: Actor) {
    const project = await this.projects.updateProject(id, body, me);
    return { data: toProjectDetailDto(project) };
  }

  /**
   * 이 과제의 workflow **전체**를 반환하되, 각 항목에 `myAccess`를 실어 보낸다.
   *
   * ★ 권한 없는 workflow도 목록에서 빼지 않는다 — Information page가 "존재는 보여주되
   *   disabled로 잠근다"를 그려야 하기 때문이다(설계서 01장 §3.7). app bar의 select는
   *   `myAccess === null`인 항목을 option에서 뺀다. 대신 그런 항목은 DTO가 이름·부서 외
   *   아무것도 담지 않는다.
   */
  @Get(':id/workflows')
  async workflowsForProject(@Param('id') id: string, @CurrentActor() me: Actor) {
    const project = await this.projects.assertViewAccess(id, me);
    const list = await this.workflows.listForProject(id);
    return {
      data: list.map((workflow) => toWorkflowDto(workflow, workflowLevel(me, workflow, project))),
    };
  }

  /**
   * workflow 생성. phase는 이 과제의 마일스톤 복사본으로 채워진다 — 그 복사가 일어나는
   * 곳이 ProjectsService.createWorkflow다(마일스톤을 아는 유일한 곳).
   *
   * department는 필수이며 "내가 이 과제에서 속한 부서"여야 한다(Admin은 전체 중).
   */
  @Post(':id/workflows')
  async createWorkflow(
    @Param('id') id: string,
    @Body() body: CreateWorkflowDto,
    @CurrentActor() me: Actor,
  ) {
    const workflow = await this.projects.createWorkflow(id, body, me);
    // 만든 사람이 곧 Owner이므로 항상 edit이다.
    return { data: toWorkflowDto(workflow, 'edit') };
  }

  // workflow-directory 라우트는 사라졌다 — 산출물의 수신 workflow(recvWorkflowId) 개념이
  // 폐기되고 recipient(부서/사용자)로 대체되었기 때문이다(설계서 04장 §3).

  /**
   * 과제 팀원(부서별 로스터) 추가 — **Admin만**. 이미 다른 부서에 속한 멤버를 또 다른
   * 부서 카드에서 추가하면 그 부서가 목록에 더해진다(한 멤버가 여러 부서에 속할 수 있다).
   *
   * ★ 이 명단이 **시스템 전체의 최종 관문**이다 — 여기 없는 사람은 workflow/artifact
   *   권한을 받았더라도 그 과제의 무엇도 볼 수 없다(설계서 01장 §2.2).
   */
  @Post(':id/members')
  async addMember(@Param('id') id: string, @Body() body: AddMemberDto, @CurrentActor() me: Actor) {
    const project = await this.projects.addMember(id, body.knoxId, body.department, me);
    return { data: toProjectDetailDto(project) };
  }

  /** 멤버를 지정한 부서 카드에서 뺀다 — 그 부서가 그 멤버의 마지막 부서였으면 명단에서 완전히 사라진다. */
  @Delete(':id/members/:knoxId')
  async removeMember(
    @Param('id') id: string,
    @Param('knoxId') knoxId: string,
    @Query('department') department: string,
    @CurrentActor() me: Actor,
  ) {
    const project = await this.projects.removeMember(id, knoxId, department, me);
    return { data: toProjectDetailDto(project) };
  }
}
