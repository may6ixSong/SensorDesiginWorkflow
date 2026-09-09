import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { Actor } from '../common/actor';
import { ProjectLinksService } from './project-links.service';
import { CreateProjectLinkDto, toProjectLinkDto } from './dto/project-link.dto';

/**
 * §19.3 - 프로젝트 코드+리비전 기준 외부 서비스 연동 링크.
 *
 * 경로가 둘로 갈리는 이유: 후보 검색은 "그 서비스" 관점(hub/services/:key/...)이고,
 * 링크 자체는 "이 과제" 관점(projects/:projectId/...)이라 각각 자연스러운 리소스
 * 아래에 둔다. 별도 클래스 prefix 없이 각 핸들러가 전체 경로를 직접 명시한다.
 */
@Controller()
export class ProjectLinksController {
  constructor(private readonly links: ProjectLinksService) {}

  @Get('hub/services/:key/projects/search')
  async search(
    @Param('key') key: string,
    @Query('code') code: string,
    @Query('revision') revision: string,
  ) {
    const data = await this.links.searchCandidates(key, code ?? '', revision ?? '');
    return { data };
  }

  @Get('projects/:projectId/service-links')
  async list(@Param('projectId') projectId: string) {
    const links = await this.links.list(projectId);
    return { data: links.map(toProjectLinkDto) };
  }

  @Post('projects/:projectId/service-links')
  async create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectLinkDto,
    @CurrentActor() me: Actor,
  ) {
    const link = await this.links.create(projectId, dto, me);
    return { data: toProjectLinkDto(link) };
  }

  @Delete('projects/:projectId/service-links/:linkId')
  async remove(
    @Param('projectId') projectId: string,
    @Param('linkId') linkId: string,
    @CurrentActor() me: Actor,
  ) {
    await this.links.remove(projectId, linkId, me);
    return { data: { ok: true } };
  }
}
