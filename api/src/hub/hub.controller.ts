import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { Actor } from '../common/actor';
import { HubService } from './hub.service';
import { HubCommonService } from './hub-common.service';
import { HubShowcaseService } from './hub-showcase.service';
import { HubTokenGuard } from './guards/hub-token.guard';
import {
  RegisterArtifactTypeDto,
  UpdateServiceDto,
  toArtifactServiceAdminDto,
  toArtifactServiceDto,
} from './dto/artifact-service.dto';

@Controller('hub')
export class HubController {
  constructor(
    private readonly hub: HubService,
    private readonly common: HubCommonService,
    private readonly showcase: HubShowcaseService,
  ) {}

  /**
   * 산출물의 출처를 고를 때 쓰는 목록. Admin은 꺼진 것까지 보고, 토큰도 함께 받는다
   * (Service Manage 화면용) — 일반 사용자에게는 토큰을 절대 노출하지 않는다.
   */
  @Get('services')
  async listServices(@Query('includeDisabled') includeDisabled: string, @CurrentActor() me: Actor) {
    const all = includeDisabled === 'true' && me.isAdmin;
    const list = await this.hub.list(all);
    return { data: list.map(me.isAdmin ? toArtifactServiceAdminDto : toArtifactServiceDto) };
  }

  /**
   * Admin 전용 (설계서 07장 §3.4). 판정은 실제 호출자 기준이다. 이미 등록된 baseURL이면
   * 기존 서비스에 artifact 종류만 추가한다(§3.3) — `reusedExisting`으로 그 여부를 알려준다.
   */
  @Post('services')
  async register(@Body() dto: RegisterArtifactTypeDto, @CurrentActor() me: Actor) {
    const { service, artifactTypeKey, reusedExisting } = await this.hub.registerArtifactType(dto, me);
    return { data: { ...toArtifactServiceAdminDto(service), artifactTypeKey, reusedExisting } };
  }

  @Patch('services/:key')
  async update(@Param('key') key: string, @Body() dto: UpdateServiceDto, @CurrentActor() me: Actor) {
    const svc = await this.hub.update(key, dto, me);
    return { data: toArtifactServiceAdminDto(svc) };
  }

  /**
   * 프로젝트 공용 데이터 - 부서·멤버·일정 (Hub 설계서 §4.4).
   *
   * 이 API가 SIREN을 사실상 사내 신원·일정 공급자로 만든다. 각 산출물 서비스는 필요한
   * 것만 골라 쓰고, 응답을 짧게 캐시해 SIREN이 응답하지 않을 때 마지막 캐시로 동작해야
   * 한다 - SIREN 가용성이 각 서비스의 권한 화면을 막아서는 안 된다.
   *
   * ★ 등록된 서비스만 부를 수 있어야 한다 — `HubTokenGuard`로 그 서비스의 Bearer
   *   token을 검증한다(version 이벤트 수신과 같은 가드). Calypso도 이제 자기 Access
   *   패널의 부서/멤버 로스터를 위해 이 경로로 자기 토큰을 실어 부른다
   *   (`calypso/src/siren-common/siren-common.service.ts`).
   */
  @Get('common')
  @UseGuards(HubTokenGuard)
  async getCommon(@Query('projectId') projectId: string) {
    return { data: await this.common.build(projectId) };
  }

  /**
   * 대문(§15.4)의 슬랩에 얹을 대표 산출물 몇 개. 순수 표시용이라 giver 마스킹 없이
   * 항상 공개해도 되는 released 버전만 준다 — 워크플로우 맥락이 없어 giver 판정(§6.2)
   * 자체가 불가능하다.
   */
  @Get('services/:key/showcase')
  async getShowcase(@Param('key') key: string) {
    return { data: await this.showcase.list(key) };
  }
}
