import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentActor } from '../common/current-actor.decorator';
import { Actor } from '../common/actor';
import { SirenCallerGuard } from '../common/siren-caller.guard';
import { TemplatesService, toTemplateDto } from './templates.service';
import { TemplateInputDto } from './templates.dto';

/**
 * 표 template(SIREN 설계서 11장). 읽기는 누구나(SIREN BE를 거친 로그인 사용자), 쓰기는
 * Admin만(`X-User-Group: Admin` — SIREN BE가 실제 Admin 판정 뒤에만 싣는다).
 */
@Controller('templates')
@UseGuards(SirenCallerGuard)
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  async list(@Query('includeArchived') includeArchived: string | undefined, @CurrentActor() me: Actor) {
    const list = await this.templates.list(includeArchived === 'true' && me.isAdmin);
    return { data: list.map(toTemplateDto) };
  }

  /** `?version=`를 주면 그때의 정의(옛 표 버전을 그릴 때), 없으면 최신. */
  @Get(':key')
  async detail(@Param('key') key: string, @Query('version') version: string | undefined) {
    const v = version ? Number(version) : undefined;
    return { data: await this.templates.definition(key, Number.isFinite(v) ? v : undefined) };
  }

  @Post()
  async create(@Body() dto: TemplateInputDto, @CurrentActor() me: Actor) {
    return { data: toTemplateDto(await this.templates.create(dto, me)) };
  }

  @Put(':key')
  async update(@Param('key') key: string, @Body() dto: TemplateInputDto, @CurrentActor() me: Actor) {
    return { data: toTemplateDto(await this.templates.update(key, dto, me)) };
  }
}
