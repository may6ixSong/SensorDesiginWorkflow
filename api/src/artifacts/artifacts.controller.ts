import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { WorkflowAccessGuard } from '../common/guards/workflow-access.guard';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { Actor } from '../common/actor';
import { ArtifactsService } from './artifacts.service';
import { ReplaceArtifactAccessDto } from './dto/artifact-crud.dto';

/**
 * artifact 자체를 다루는 라우트.
 *
 * ★ 상세 slide 열람은 block 맥락이 필요하므로(A Tier의 recipient가 block에 있다) 캔버스
 *   응답(`GET /workflows/:id/blocks`)이 그 판정을 이미 끝내서 내려준다. 여기 라우트는
 *   권한 편집처럼 block과 무관한 작업만 담당한다.
 */
@Controller('artifacts')
@UseGuards(WorkflowAccessGuard)
export class ArtifactsController {
  constructor(private readonly artifacts: ArtifactsService) {}

  /**
   * B/C/D의 Edit/View 권한 교체. **viewAccess가 곧 recipient**이므로 이 한 번의 쓰기가
   * 열람 권한과 수신 대상을 동시에 바꾼다(설계서 04장 §3.2).
   * A Tier는 서비스가 권한을 관리하므로 서비스단에서 400으로 거부된다.
   */
  @Put(':id/access')
  async replaceAccess(
    @Param('id') id: string,
    @Body() dto: ReplaceArtifactAccessDto,
    @CurrentActor() me: Actor,
  ) {
    return this.artifacts.replaceAccess(id, dto, me);
  }
}
