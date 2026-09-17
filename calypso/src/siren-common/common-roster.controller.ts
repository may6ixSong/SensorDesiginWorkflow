import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SirenCallerGuard } from '../common/siren-caller.guard';
import { SirenCommonService } from './siren-common.service';

/**
 * SIREN BE 전용 경로(다른 사람이 쓰는 라우트와 같은 가드) — Access 패널이 부서/멤버
 * 로스터를 보여줄 때, SIREN BE가 이 라우트를 거쳐서 Calypso에게 물어보고, Calypso는
 * 다시 SIREN 자신의 `/hub/common`을 불러 답한다(`SirenCommonService` 참고).
 */
@Controller('common')
@UseGuards(SirenCallerGuard)
export class CommonRosterController {
  constructor(private readonly siren: SirenCommonService) {}

  @Get('departments')
  async departments(@Query('projectId') projectId: string) {
    const roster = await this.siren.getDepartmentRoster(projectId);
    return { data: roster ?? { departments: [], members: [] } };
  }
}
