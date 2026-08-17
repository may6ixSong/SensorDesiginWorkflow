import { Module } from '@nestjs/common';
import { Project, ProjectSchema } from './schemas/project.schema';
import { registerModels } from '../database/model-registration';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { IpsModule } from '../ips/ips.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    registerModels([{ name: Project.name, schema: ProjectSchema, populateRefs: { 'members.userId': 'User' } }]),
    IpsModule,
    UsersModule,
    AuditModule,
  ],
  providers: [ProjectsService],
  controllers: [ProjectsController],
  exports: [ProjectsService],
})
export class ProjectsModule {}
