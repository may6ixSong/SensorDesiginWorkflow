import { Module, forwardRef } from '@nestjs/common';
import { registerModels } from '../database/model-registration';
import { Release, ReleaseSchema } from './schemas/release.schema';
import { ReleasesService } from './releases.service';
import { ReleasesController } from './releases.controller';
import { CommonAccessModule } from '../common/common-access.module';
import { AuditModule } from '../audit/audit.module';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { EdgesModule } from '../edges/edges.module';
import { HubModule } from '../hub/hub.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BlocksModule } from '../blocks/blocks.module';

const Models = registerModels([{ name: Release.name, schema: ReleaseSchema }]);

@Module({
  imports: [
    Models,
    CommonAccessModule,
    AuditModule,
    ArtifactsModule,
    EdgesModule,
    HubModule,
    NotificationsModule,
    forwardRef(() => BlocksModule),
  ],
  providers: [ReleasesService],
  controllers: [ReleasesController],
  exports: [ReleasesService, Models],
})
export class ReleasesModule {}
