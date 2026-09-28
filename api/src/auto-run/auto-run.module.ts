import { Module } from '@nestjs/common';
import { registerModels } from '../database/model-registration';
import { CommonAccessModule } from '../common/common-access.module';
import { EdgesModule } from '../edges/edges.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Artifact, ArtifactSchema } from '../artifacts/schemas/artifact.schema';
import { ArtifactService, ArtifactServiceSchema } from '../hub/schemas/artifact-service.schema';
import { AutoRun, AutoRunSchema } from './schemas/auto-run.schema';
import { AutoRunService } from './auto-run.service';
import { AutoRunDispatcher } from './auto-run.dispatcher';
import { AutoRunController } from './auto-run.controller';

/**
 * Auto Run(설계서 10장).
 *
 * ★ HubModule/ArtifactsModule을 import하지 않는다 — HubModule이 version 이벤트 수신 때문에
 *   이 모듈을 import하므로, 반대로 참조하면 모듈 순환이 생긴다. 필요한 모델은 여기서 직접
 *   등록한다(인메모리 모드에서도 같은 이름의 컬렉션을 공유한다).
 */
@Module({
  imports: [
    registerModels([
      { name: AutoRun.name, schema: AutoRunSchema },
      { name: Artifact.name, schema: ArtifactSchema },
      { name: ArtifactService.name, schema: ArtifactServiceSchema },
    ]),
    CommonAccessModule,
    EdgesModule,
    NotificationsModule,
  ],
  providers: [AutoRunService, AutoRunDispatcher],
  controllers: [AutoRunController],
  exports: [AutoRunService],
})
export class AutoRunModule {}
