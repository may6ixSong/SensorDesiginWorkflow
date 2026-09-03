import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ENV_FILE } from './config/env';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { ProjectsModule } from './projects/projects.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { DeliverablesModule } from './deliverables/deliverables.module';
import { MemosModule } from './memos/memos.module';
import { EdgesModule } from './edges/edges.module';
import { CanvasModule } from './canvas/canvas.module';
import { HldModule } from './hld/hld.module';
import { StorageModule } from './storage/storage.module';
import { AuditModule } from './audit/audit.module';
import { HubModule } from './hub/hub.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ENV_FILE, load: [configuration] }),
    DatabaseModule,
    ProjectsModule,
    WorkflowsModule,
    DeliverablesModule,
    MemosModule,
    EdgesModule,
    CanvasModule,
    HldModule,
    StorageModule,
    AuditModule,
    HubModule,
  ],
})
export class AppModule {}
