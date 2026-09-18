import { Controller, Get, Query } from '@nestjs/common';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { Actor } from '../common/actor';
import { AssignmentsService } from './assignments.service';
import { CalendarRangeDto, PageQueryDto } from './dto/assignment.dto';

/**
 * My Assignment (설계서 09장) — 과제를 가로질러 "내 일"만 모아 보는 화면의 라우트.
 *
 * ★ 여기에는 workflow 단위 Guard(`WorkflowAccessGuard`)가 붙지 않는다 — 애초에 특정
 *   workflow를 대상으로 하는 라우트가 아니고, 무엇을 보여줄지는 전부 scope 계산
 *   (MyScopeService)이 정하기 때문이다. 그 계산은 항상 "내가 member인 과제" 안에서
 *   시작하므로 Project 계층(01장 §2.2)이 그대로 지켜진다.
 */
@Controller('my')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  /** 내가/내 부서가 recipient로 전달받은 release. 최신순. */
  @Get('releases/received')
  async received(@Query() q: PageQueryDto, @CurrentActor() me: Actor) {
    return this.assignments.receivedReleases(me, q.page ?? 1, q.size ?? 20);
  }

  /** 내가 실행했거나 내 부서 workflow가 낸 release. 최신순. */
  @Get('releases/published')
  async published(@Query() q: PageQueryDto, @CurrentActor() me: Actor) {
    return this.assignments.publishedReleases(me, q.page ?? 1, q.size ?? 20);
  }

  /**
   * 내 부서가 주는 산출물(artifact가 매핑된 own block)의 목록. 최근 1년, 최근 갱신순.
   * 페이지네이션이 없다 — 1년 창과 scope로 이미 좁혀져 있고, 화면도 한 패널에 스크롤로
   * 다 담는다(설계서 09장 §3).
   */
  @Get('artifacts')
  async artifacts(@CurrentActor() me: Actor) {
    return this.assignments.myArtifacts(me);
  }

  /**
   * 달력 한 화면. 범위 밖의 event는 DB에서 잘려 오지 않는다.
   * `from`/`to`는 FE가 그리는 격자의 첫 칸·마지막 칸 다음 순간이다(로컬 시간대 기준).
   */
  @Get('calendar')
  async calendar(@Query() q: CalendarRangeDto, @CurrentActor() me: Actor) {
    return this.assignments.calendar(me, q.from, q.to);
  }
}
