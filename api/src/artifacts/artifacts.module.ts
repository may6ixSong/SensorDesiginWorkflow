import { Module } from '@nestjs/common';
import { registerModels } from '../database/model-registration';
import { Artifact, ArtifactSchema } from './schemas/artifact.schema';
import { HpcPathMock, HpcPathMockSchema } from './schemas/hpc-path-mock.schema';
import { ArtifactsService } from './artifacts.service';
import { ArtifactAccessService } from './artifact-access.service';
import { ArtifactSourceService } from './artifact-source.service';
import { ArtifactsController } from './artifacts.controller';
import { AuditModule } from '../audit/audit.module';
import { HubModule } from '../hub/hub.module';
import { CommonAccessModule } from '../common/common-access.module';

const Models = registerModels([
  { name: Artifact.name, schema: ArtifactSchema },
  { name: HpcPathMock.name, schema: HpcPathMockSchema },
]);

@Module({
  imports: [Models, AuditModule, HubModule, CommonAccessModule],
  providers: [ArtifactsService, ArtifactAccessService, ArtifactSourceService],
  controllers: [ArtifactsController],
  exports: [ArtifactsService, ArtifactAccessService, ArtifactSourceService, Models],
})
export class ArtifactsModule {}
