import { Module } from '@nestjs/common';
import { registerModels } from '../database/model-registration';
import { Artifact, ArtifactSchema } from './schemas/artifact.schema';
import { ArtifactsService } from './artifacts.service';
import { ArtifactAccessService } from './artifact-access.service';
import { ArtifactSourceService } from './artifact-source.service';
import { ArtifactsController } from './artifacts.controller';
import { AuditModule } from '../audit/audit.module';
import { HubModule } from '../hub/hub.module';
import { CommonAccessModule } from '../common/common-access.module';

// HpcPathMock(HPC Service 미리보기 전용 mock)은 제거했다 — HPC망 양방향 API 연동이 확정되면서
// OA Service와 동일한 실연동 대상이 됐다(설계서 04장 §2, §6.3, 02-data-model.md §4.1).
const Models = registerModels([
  { name: Artifact.name, schema: ArtifactSchema },
]);

@Module({
  imports: [Models, AuditModule, HubModule, CommonAccessModule],
  providers: [ArtifactsService, ArtifactAccessService, ArtifactSourceService],
  controllers: [ArtifactsController],
  exports: [ArtifactsService, ArtifactAccessService, ArtifactSourceService, Models],
})
export class ArtifactsModule {}
