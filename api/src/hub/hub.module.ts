import { Module } from '@nestjs/common';
import { registerModels } from '../database/model-registration';
import { AuditModule } from '../audit/audit.module';
import { ArtifactService, ArtifactServiceSchema } from './schemas/artifact-service.schema';
import { HubSyncCheckpoint, HubSyncCheckpointSchema } from './schemas/hub-sync-checkpoint.schema';
import { Project, ProjectSchema } from '../projects/schemas/project.schema';
import { Workflow, WorkflowSchema } from '../workflows/schemas/workflow.schema';
import { HubService } from './hub.service';
import { HubCommonService } from './hub-common.service';
import { HubController } from './hub.controller';

/**
 * Hub - 레지스트리(§3.2), 공용 데이터 API(§4.4), B 티어 동기화 커서(§8.4).
 *
 * 여기 있는 코드는 SIREN이 각 산출물 서비스를 **관측**하기 위한 것이지, 산출물 데이터를
 * 소유하기 위한 것이 아니다(§1.2). 실물 파일·버전 이력·다운로드 판정은 전부 각 서비스에 있다.
 */
@Module({
  imports: [
    registerModels([
      { name: ArtifactService.name, schema: ArtifactServiceSchema },
      { name: HubSyncCheckpoint.name, schema: HubSyncCheckpointSchema },
      { name: Project.name, schema: ProjectSchema },
      { name: Workflow.name, schema: WorkflowSchema },
    ]),
    AuditModule,
  ],
  providers: [HubService, HubCommonService],
  controllers: [HubController],
  exports: [HubService, HubCommonService],
})
export class HubModule {}
