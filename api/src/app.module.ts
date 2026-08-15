import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { IpsModule } from './ips/ips.module';
import { DeliverablesModule } from './deliverables/deliverables.module';
import { MemosModule } from './memos/memos.module';
import { EdgesModule } from './edges/edges.module';
import { CanvasModule } from './canvas/canvas.module';
import { HldModule } from './hld/hld.module';
import { StorageModule } from './storage/storage.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    IpsModule,
    DeliverablesModule,
    MemosModule,
    EdgesModule,
    CanvasModule,
    HldModule,
    StorageModule,
    AuditModule,
  ],
})
export class AppModule {}
