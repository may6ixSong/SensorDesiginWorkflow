import { BadGatewayException, Body, Controller, Get, HttpException, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { Actor, assertAdmin } from '../common/actor';
import { CalypsoClientService } from './calypso-client.service';
import { CalypsoTemplateDto } from './dto/calypso-proxy.dto';

/**
 * 표(table) template 프록시(설계서 11장). template은 Calypso가 소유하고, SIREN FE는 여기로만
 * 부른다(07장 §2 FE→BE 단일 경로).
 *
 * - 읽기: 로그인한 사용자 누구나 — artifact를 만들고 표를 그리는 데 필요하다. project와
 *   무관한 전역 데이터라 project 게이트가 없다.
 * - 쓰기: Admin만. SIREN이 실제 Admin(`actor.isAdmin`, 시뮬레이션 대상 기준)을 먼저 확인하고,
 *   Calypso도 같은 판정을 한 번 더 한다.
 */
@Controller('calypso-templates')
export class CalypsoTemplatesController {
  constructor(private readonly calypso: CalypsoClientService) {}

  private relay(result: { status: number; body: any } | null): any {
    if (!result) throw new BadGatewayException('Could not reach the file service (Calypso). Check that it is running.');
    if (result.status >= 200 && result.status < 300) return result.body;
    throw new HttpException(result.body ?? { message: 'Template request failed.' }, result.status);
  }

  @Get()
  async list(@Query('includeArchived') includeArchived: string | undefined, @CurrentActor() me: Actor) {
    const q = includeArchived === 'true' && me.isAdmin ? '?includeArchived=true' : '';
    return this.relay(await this.calypso.forward('GET', `/templates${q}`, undefined, me.knoxId, [], me.isAdmin));
  }

  @Get(':key')
  async detail(@Param('key') key: string, @Query('version') version: string | undefined, @CurrentActor() me: Actor) {
    const q = version ? `?version=${encodeURIComponent(version)}` : '';
    return this.relay(await this.calypso.forward('GET', `/templates/${encodeURIComponent(key)}${q}`, undefined, me.knoxId, [], me.isAdmin));
  }

  @Post()
  async create(@Body() dto: CalypsoTemplateDto, @CurrentActor() me: Actor) {
    assertAdmin(me);
    return this.relay(await this.calypso.forward('POST', '/templates', dto, me.knoxId, [], true));
  }

  @Put(':key')
  async update(@Param('key') key: string, @Body() dto: CalypsoTemplateDto, @CurrentActor() me: Actor) {
    assertAdmin(me);
    return this.relay(await this.calypso.forward('PUT', `/templates/${encodeURIComponent(key)}`, dto, me.knoxId, [], true));
  }
}
