import { Module } from '@nestjs/common';
import { registerModels } from '../database/model-registration';
import { AuditModule } from '../audit/audit.module';
import { ArtifactService, ArtifactServiceSchema } from './schemas/artifact-service.schema';
import { HubSyncCheckpoint, HubSyncCheckpointSchema } from './schemas/hub-sync-checkpoint.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { Workflow, WorkflowSchema } from '../workflows/schemas/workflow.schema';
import { Artifact, ArtifactSchema } from '../artifacts/schemas/artifact.schema';
import { HubService } from './hub.service';
import { HubCommonService } from './hub-common.service';
import { HubShowcaseService } from './hub-showcase.service';
import { ObserverClientService } from './observer-client.service';
import { CalypsoClientService } from './calypso-client.service';
import { HubSyncService } from './hub-sync.service';
import { HubController } from './hub.controller';
import { MockObserverController } from './mock/mock-observer.controller';

/**
 * ★ 개발 전용 ★ — MOCKUP_ENABLED=true 일 때만 가짜 A Tier 서비스 엔드포인트를 등록한다.
 * 개발 환경에는 실서비스(SimHub/RPM)가 없어 게이트 2가 항상 실패하고, 그러면 A Tier
 * 산출물이 아무에게도 안 보여 UI를 만들 수 없다. 자세한 사정은 그 컨트롤러 주석 참고.
 * 운영(MOCKUP_ENABLED=false)에서는 라우트 자체가 존재하지 않는다.
 */
const mockControllers = process.env.MOCKUP_ENABLED === 'true' ? [MockObserverController] : [];

/**
 * Hub - 레지스트리(§3.2), 공용 데이터 API(§4.4), 야간 재동기화 커서(설계서 07장 §6).
 *
 * 여기 있는 코드는 SIREN이 각 산출물 서비스를 **관측**하기 위한 것이지, 산출물 데이터를
 * 소유하기 위한 것이 아니다(§1.2). 실물 파일·버전 이력·다운로드 판정은 전부 각 서비스에 있다.
 *
 * ★ `ProjectServiceLink`(project 사전 링크)는 제거했다 — 후보 조회는 이제 code+revision을
 *   그대로 필터로 실어 매번 실시간으로 한다(설계서 04장 §6.3).
 */
@Module({
  imports: [
    registerModels([
      { name: ArtifactService.name, schema: ArtifactServiceSchema },
      { name: HubSyncCheckpoint.name, schema: HubSyncCheckpointSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Workflow.name, schema: WorkflowSchema },
      { name: Artifact.name, schema: ArtifactSchema },
    ]),
    AuditModule,
  ],
  providers: [
    HubService,
    HubCommonService,
    HubShowcaseService,
    ObserverClientService,
    CalypsoClientService,
    HubSyncService,
  ],
  controllers: [HubController, ...mockControllers],
  exports: [HubService, HubCommonService, ObserverClientService, CalypsoClientService, HubSyncService],
})
export class HubModule {}
