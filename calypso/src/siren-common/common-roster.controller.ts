import { BadGatewayException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SirenCallerGuard } from '../common/siren-caller.guard';
import { SirenCommonService } from './siren-common.service';

/**
 * SIREN BE 전용 경로(다른 사람이 쓰는 라우트와 같은 가드) — Access 패널이 부서/멤버
 * 로스터를 보여줄 때, SIREN BE가 이 라우트를 거쳐서 Calypso에게 물어보고, Calypso는
 * 다시 SIREN 자신의 `/hub/common`을 불러 답한다(`SirenCommonService` 참고).
 *
 * ★ SIREN 쪽 호출이 실패하면(토큰 불일치, 네트워크 등) 반드시 에러로 응답한다 — 예전에는
 *   실패를 `{departments: [], members: []}` 200으로 감춰서, "이 프로젝트엔 부서가
 *   없다"와 "SIREN에 못 물어봤다"가 화면에서 구분이 안 됐다(실제로 토큰이 어긋나
 *   있었는데 그냥 빈 목록으로만 보였던 사고, 사용자 보고). Calypso 로그(`SirenCommonService`의
 *   warn)와 FE가 받는 상태 코드가 항상 같은 이야기를 하게 만든다.
 */
@Controller('common')
@UseGuards(SirenCallerGuard)
export class CommonRosterController {
  constructor(private readonly siren: SirenCommonService) {}

  @Get('departments')
  async departments(@Query('projectId') projectId: string) {
    const roster = await this.siren.getDepartmentRoster(projectId);
    if (!roster) {
      throw new BadGatewayException(
        'Could not reach SIREN to load the department roster. Check Calypso’s SIREN_BASE_URL/CALYPSO_EVENT_TOKEN and see the Calypso logs for the exact failure.',
      );
    }
    return { data: roster };
  }
}
