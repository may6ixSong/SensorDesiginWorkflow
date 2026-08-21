import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';
import { ProjectsService } from './projects.service';
import { IpsService } from '../ips/ips.service';
import { toIpDto } from '../ips/dto/ip.dto';
import { toProjectDetailDto } from './dto/project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UpdatePhasesDto } from './dto/update-phases.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly ips: IpsService,
  ) {}

  @Get()
  async list(@CurrentUser() me: UserDocument) {
    const projects = await this.projects.listAccessibleForUser(me._id.toString());
    return { data: projects };
  }

  /** Project Information 페이지용 상세 조회(phases + 부서별 팀원 로스터). */
  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() me: UserDocument) {
    const project = await this.projects.findDetailOrThrow(id, me._id.toString());
    return { data: toProjectDetailDto(project) };
  }

  @Get(':id/phases')
  async phases(@Param('id') id: string) {
    const phases = await this.projects.getPhases(id);
    return { data: phases };
  }

  /** 마일스톤 일정(label/start/end) 수정 — 이 과제의 IP 중 하나라도 Edit 권한이 있는 사람만 가능. */
  @Patch(':id/phases')
  async updatePhases(@Param('id') id: string, @Body() body: UpdatePhasesDto, @CurrentUser() me: UserDocument) {
    const project = await this.projects.updatePhases(id, body.phases, me);
    return { data: toProjectDetailDto(project) };
  }

  /** 과제 메타데이터 수정 — 이 과제의 IP 중 하나라도 Edit 권한이 있는 사람만 가능. */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateProjectDto, @CurrentUser() me: UserDocument) {
    const project = await this.projects.updateProject(id, body, me);
    return { data: toProjectDetailDto(project) };
  }

  /** Edit 또는 View 권한이 있는 IP만 반환 (설계서 5.1). */
  @Get(':id/ips')
  async ipsForProject(@Param('id') id: string, @CurrentUser() me: UserDocument) {
    const list = await this.ips.listAccessibleForProject(id, me._id.toString());
    const populated = await Promise.all(list.map((ip) => this.ips.findPopulatedOrThrow(ip._id.toString())));
    return { data: populated.map((ip) => toIpDto(ip, me)) };
  }

  /**
   * 산출물의 수신 IP(recvIpId) 셀렉트 박스용 — 과제 소속 IP 전체를 가볍게 반환한다
   * (개인 접근 권한으로 필터링하지 않음). 이 과제에 접근 권한이 있어야 조회 가능.
   */
  @Get(':id/ip-directory')
  async ipDirectory(@Param('id') id: string, @CurrentUser() me: UserDocument) {
    await this.projects.assertViewAccess(id, me._id.toString());
    const list = await this.ips.listDirectoryForProject(id);
    return { data: list };
  }

  /** 과제 팀원(부서별 로스터) 추가 — 이 과제의 IP 중 하나라도 Edit 권한이 있는 사람만 관리 가능. */
  @Post(':id/members')
  async addMember(@Param('id') id: string, @Body() body: AddMemberDto, @CurrentUser() me: UserDocument) {
    const project = await this.projects.addMember(id, body.userId, body.department, me);
    return { data: toProjectDetailDto(project) };
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() me: UserDocument,
  ) {
    const project = await this.projects.removeMember(id, userId, me);
    return { data: toProjectDetailDto(project) };
  }
}
