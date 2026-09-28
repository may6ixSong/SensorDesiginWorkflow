import { Module } from '@nestjs/common';
import { registerModels } from '../database/model-registration';
import { Artifact, ArtifactSchema } from './schemas/artifact.schema';
import { ArtifactTable, ArtifactTableSchema } from './schemas/artifact-table.schema';
import { TemplatesModule } from '../templates/templates.module';
import { ArtifactsService } from './artifacts.service';
import { ArtifactsController } from './artifacts.controller';
import { StorageModule } from '../storage/storage.module';
import { SirenCommonModule } from '../siren-common/siren-common.module';

@Module({
  imports: [
    registerModels([
      { name: Artifact.name, schema: ArtifactSchema },
      { name: ArtifactTable.name, schema: ArtifactTableSchema },
    ]),
    TemplatesModule,
    StorageModule,
    SirenCommonModule,
  ],
  providers: [ArtifactsService],
  controllers: [ArtifactsController],
  // Auto Run source 접근(auto-run/)이 같은 조회 경로를 쓴다.
  exports: [ArtifactsService],
})
export class ArtifactsModule {}
