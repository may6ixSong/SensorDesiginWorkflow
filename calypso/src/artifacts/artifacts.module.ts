import { Module } from '@nestjs/common';
import { registerModels } from '../database/model-registration';
import { Artifact, ArtifactSchema } from './schemas/artifact.schema';
import { ArtifactsService } from './artifacts.service';
import { ArtifactsController } from './artifacts.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [registerModels([{ name: Artifact.name, schema: ArtifactSchema }]), StorageModule],
  providers: [ArtifactsService],
  controllers: [ArtifactsController],
})
export class ArtifactsModule {}
