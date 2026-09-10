import { Module } from '@nestjs/common';
import { registerModels } from '../database/model-registration';
import { Artifact, ArtifactSchema } from './schemas/artifact.schema';
import { ArtifactsService } from './artifacts.service';
import { ArtifactAccessService } from './artifact-access.service';
import { ArtifactsController } from './artifacts.controller';
import { AuditModule } from '../audit/audit.module';
import { HubModule } from '../hub/hub.module';
import { CommonAccessModule } from '../common/common-access.module';

const Models = registerModels([{ name: Artifact.name, schema: ArtifactSchema }]);

@Module({
  imports: [Models, AuditModule, HubModule, CommonAccessModule],
  providers: [ArtifactsService, ArtifactAccessService],
  controllers: [ArtifactsController],
  exports: [ArtifactsService, ArtifactAccessService, Models],
})
export class ArtifactsModule {}
