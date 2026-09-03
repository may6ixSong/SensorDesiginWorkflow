import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { Actor } from '../common/actor';
import { HubService } from './hub.service';
import { HubCommonService } from './hub-common.service';
import {
  RegisterServiceDto,
  UpdateServiceDto,
  toArtifactServiceDto,
} from './dto/artifact-service.dto';

@Controller('hub')
export class HubController {
  constructor(
    private readonly hub: HubService,
    private readonly common: HubCommonService,
  ) {}

  /** 산출물의 출처를 고를 때 쓰는 목록. Admin은 꺼진 것까지 본다. */
  @Get('services')
  async listServices(@Query('includeDisabled') includeDisabled: string, @CurrentActor() me: Actor) {
    const all = includeDisabled === 'true' && me.isAdmin;
    const list = await this.hub.list(all);
    return { data: list.map(toArtifactServiceDto) };
  }

  /** Admin 전용 (Hub 설계서 §13.4). 판정은 실제 호출자 기준이다. */
  @Post('services')
  async register(@Body() dto: RegisterServiceDto, @CurrentActor() me: Actor) {
    const svc = await this.hub.register(dto, me);
    return { data: toArtifactServiceDto(svc) };
  }

  @Patch('services/:key')
  async update(@Param('key') key: string, @Body() dto: UpdateServiceDto, @CurrentActor() me: Actor) {
    const svc = await this.hub.update(key, dto, me);
    return { data: toArtifactServiceDto(svc) };
  }

  /**
   * 프로젝트 공용 데이터 - 부서·멤버·일정 (Hub 설계서 §4.4).
   *
   * 이 API가 SIREN을 사실상 사내 신원·일정 공급자로 만든다. 각 산출물 서비스는 필요한
   * 것만 골라 쓰고, 응답을 짧게 캐시해 SIREN이 응답하지 않을 때 마지막 캐시로 동작해야
   * 한다 - SIREN 가용성이 각 서비스의 권한 화면을 막아서는 안 된다.
   */
  @Get('common')
  async getCommon(@Query('projectId') projectId: string) {
    return { data: await this.common.build(projectId) };
  }
}
