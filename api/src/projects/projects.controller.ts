import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { Actor } from '../common/actor';
import { ProjectsService } from './projects.service';
import { IpsService } from '../ips/ips.service';
import { toIpDto } from '../ips/dto/ip.dto';
import { toProjectDetailDto } from './dto/project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdatePhasesDto } from './dto/update-phases.dto';
import { UpdateIpDomainsDto } from './dto/update-ip-domains.dto';
import { UpdateIpDomainDto } from './dto/update-ip-domain.dto';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly ips: IpsService,
  ) {}

  @Get()
  async list(@CurrentActor() me: Actor) {
    const projects = await this.projects.listAccessibleForUser(me.knoxId);
    return { data: projects };
  }

  /** Project Information 페이지용 상세 조회(phases + 부서별 팀원 로스터). */
  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentActor() me: Actor) {
    const project = await this.projects.findDetailOrThrow(id, me.knoxId);
    return { data: toProjectDetailDto(project) };
  }

  @Get(':id/phases')
  async phases(@Param('id') id: string) {
    const phases = await this.projects.getPhases(id);
    return { data: phases };
  }

  /** 마일스톤 일정(label/start/end) 수정 — 이 과제의 IP 중 하나라도 Edit 권한이 있는 사람만 가능. */
  @Patch(':id/phases')
  async updatePhases(@Param('id') id: string, @Body() body: UpdatePhasesDto, @CurrentActor() me: Actor) {
    const project = await this.projects.updatePhases(id, body.phases, me);
    return { data: toProjectDetailDto(project) };
  }

  /**
   * IP 도메인 후보 목록 교체. @Patch(':id')보다 위에 있어야 한다 - 아래에 두면
   * ':id'가 'ip-domains'까지 먹어 이 라우트에 도달하지 못한다.
   */
  @Patch(':id/ip-domains')
  async updateIpDomains(
    @Param('id') id: string,
    @Body() body: UpdateIpDomainsDto,
    @CurrentActor() me: Actor,
  ) {
    const project = await this.projects.updateIpDomains(id, body.ipDomains, me);
    return { data: toProjectDetailDto(project) };
  }

  /** IP 하나를 이 과제의 도메인에 배정 (빈 문자열이면 배정 해제). */
  @Patch(':id/ips/:ipId/domain')
  async updateIpDomain(
    @Param('id') id: string,
    @Param('ipId') ipId: string,
    @Body() body: UpdateIpDomainDto,
    @CurrentActor() me: Actor,
  ) {
    const project = await this.projects.updateIpDomain(id, ipId, body.domain, me);
    return { data: toProjectDetailDto(project) };
  }

  /** 과제 메타데이터 수정 — 이 과제의 IP 중 하나라도 Edit 권한이 있는 사람만 가능. */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateProjectDto, @CurrentActor() me: Actor) {
    const project = await this.projects.updateProject(id, body, me);
    return { data: toProjectDetailDto(project) };
  }

  /** Edit 또는 View 권한이 있는 IP만 반환 (설계서 5.1). */
  @Get(':id/ips')
  async ipsForProject(@Param('id') id: string, @CurrentActor() me: Actor) {
    const list = await this.ips.listAccessibleForProject(id, me.knoxId);
    return { data: list.map((ip) => toIpDto(ip, me)) };
  }

  /**
   * 산출물의 수신 IP(recvIpId) 셀렉트 박스용 — 과제 소속 IP 전체를 가볍게 반환한다
   * (개인 접근 권한으로 필터링하지 않음). 이 과제에 접근 권한이 있어야 조회 가능.
   */
  @Get(':id/ip-directory')
  async ipDirectory(@Param('id') id: string, @CurrentActor() me: Actor) {
    await this.projects.assertViewAccess(id, me.knoxId);
    const list = await this.ips.listDirectoryForProject(id);
    return { data: list };
  }

  /** 과제 팀원(부서별 로스터) 추가 — 이 과제의 IP 중 하나라도 Edit 권한이 있는 사람만 관리 가능. */
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
