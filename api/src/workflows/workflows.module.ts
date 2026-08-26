import { Module } from '@nestjs/common';
import { CommonAccessModule } from '../common/common-access.module';
import { AuditModule } from '../audit/audit.module';
import { WorkflowsService } from './workflows.service';
import { WorkflowsController } from './workflows.controller';

@Module({
  imports: [CommonAccessModule, AuditModule],
  providers: [WorkflowsService],
  controllers: [WorkflowsController],
  exports: [WorkflowsService],
})
export class WorkflowsModule {}
