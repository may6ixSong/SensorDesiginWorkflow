import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ENV_FILE } from './config/env';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { ProjectsModule } from './projects/projects.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { NodesModule } from './nodes/nodes.module';
import { MemosModule } from './memos/memos.module';
import { CommentsModule } from './comments/comments.module';
import { EdgesModule } from './edges/edges.module';
import { CanvasModule } from './canvas/canvas.module';
import { ReleasesModule } from './releases/releases.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StorageModule } from './storage/storage.module';
import { AuditModule } from './audit/audit.module';
import { HubModule } from './hub/hub.module';
import { AssignmentsModule } from './assignments/assignments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ENV_FILE, load: [configuration] }),
    DatabaseModule,
    ProjectsModule,
    WorkflowsModule,
    ArtifactsModule,
    NodesModule,
    MemosModule,
    CommentsModule,
    EdgesModule,
    CanvasModule,
    ReleasesModule,
    NotificationsModule,
    StorageModule,
    AuditModule,
    HubModule,
    AssignmentsModule,
  ],
})
export class AppModule {}
