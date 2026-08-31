import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
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
import { UpdateWorkflowDomainsDto } from './dto/update-workflow-domains.dto';
import { UpdateWorkflowDomainDto } from './dto/update-workflow-domain.dto';
import { CreateWorkflowDto } from '../workflows/dto/workflow-crud.dto';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly workflows: WorkflowsService,
  ) {}

  @Get()
  async list(@CurrentActor() me: Actor) {
    const projects = await this.projects.listAccessibleForUser(me.knoxId);
    return { data: projects.map(toProjectDetailDto) };
  }

  /** Project Information 페이지용 상세 조회(마일스톤 + 부서별 팀원 로스터). */
  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentActor() me: Actor) {
    const project = await this.projects.findDetailOrThrow(id, me.knoxId);
    return { data: toProjectDetailDto(project) };
  }

  @Get(':id/milestones')
  async milestones(@Param('id') id: string) {
    const milestones = await this.projects.getMilestones(id);
    return { data: milestones };
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

  /**
   * Workflow 도메인 후보 목록 교체. @Patch(':id')보다 위에 있어야 한다 - 아래에 두면
   * ':id'가 'workflow-domains'까지 먹어 이 라우트에 도달하지 못한다.
   */
  @Patch(':id/workflow-domains')
  async updateWorkflowDomains(
    @Param('id') id: string,
    @Body() body: UpdateWorkflowDomainsDto,
    @CurrentActor() me: Actor,
  ) {
    const project = await this.projects.updateWorkflowDomains(id, body.workflowDomains, me);
    return { data: toProjectDetailDto(project) };
  }

  /** workflow 하나를 이 과제의 도메인에 배정 (빈 문자열이면 배정 해제). */
  @Patch(':id/workflows/:workflowId/domain')
  async updateWorkflowDomain(
    @Param('id') id: string,
    @Param('workflowId') workflowId: string,
    @Body() body: UpdateWorkflowDomainDto,
    @CurrentActor() me: Actor,
  ) {
    const project = await this.projects.updateWorkflowDomain(id, workflowId, body.domain, me);
    return { data: toProjectDetailDto(project) };
  }

  /** 과제 메타데이터 수정 — 이 과제의 Workflow 중 하나라도 Edit 권한이 있는 사람만 가능. */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateProjectDto, @CurrentActor() me: Actor) {
    const project = await this.projects.updateProject(id, body, me);
    return { data: toProjectDetailDto(project) };
  }

  /** Edit 또는 View 권한이 있는 workflow만 반환 (설계서 5.1). */
  @Get(':id/workflows')
  async workflowsForProject(@Param('id') id: string, @CurrentActor() me: Actor) {
    const list = await this.workflows.listAccessibleForProject(id, me.knoxId);
    return { data: list.map((workflow) => toWorkflowDto(workflow, me)) };
  }

  /**
   * 도메인 아래에 workflow 생성. phase는 이 과제의 마일스톤 복사본으로 채워진다 —
   * 그 복사가 일어나는 곳이 ProjectsService.createWorkflow다(마일스톤을 아는 유일한 곳).
   */
  @Post(':id/workflows')
  async createWorkflow(
    @Param('id') id: string,
    @Body() body: CreateWorkflowDto,
    @CurrentActor() me: Actor,
  ) {
    const workflow = await this.projects.createWorkflow(id, body, me);
    return { data: toWorkflowDto(workflow, me) };
  }

  /**
   * 산출물의 수신 Workflow(recvWorkflowId) 셀렉트 박스용 — 과제 소속 Workflow 전체를 가볍게 반환한다
   * (개인 접근 권한으로 필터링하지 않음). 이 과제에 접근 권한이 있어야 조회 가능.
   */
  @Get(':id/workflow-directory')
  async workflowDirectory(@Param('id') id: string, @CurrentActor() me: Actor) {
    await this.projects.assertViewAccess(id, me.knoxId);
    const list = await this.workflows.listDirectoryForProject(id);
    return { data: list };
  }

  /** 과제 팀원(부서별 로스터) 추가 — 이 과제의 Workflow 중 하나라도 Edit 권한이 있는 사람만 관리 가능. */
  @Post(':id/members')
  async addMember(@Param('id') id: string, @Body() body: AddMemberDto, @CurrentActor() me: Actor) {
    const project = await this.projects.addMember(id, body.knoxId, body.department, me);
    return { data: toProjectDetailDto(project) };
  }

  @Delete(':id/members/:knoxId')
  async removeMember(
    @Param('id') id: string,
    @Param('knoxId') knoxId: string,
    @CurrentActor() me: Actor,
  ) {
    const project = await this.projects.removeMember(id, knoxId, me);
    return { data: toProjectDetailDto(project) };
  }
}
