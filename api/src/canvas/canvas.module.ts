import { Module } from '@nestjs/common';
import { CommonAccessModule } from '../common/common-access.module';
import { MemosModule } from '../memos/memos.module';
import { EdgesModule } from '../edges/edges.module';
import { AuditModule } from '../audit/audit.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { BlocksModule } from '../blocks/blocks.module';
import { CanvasService } from './canvas.service';
import { CanvasController } from './canvas.controller';

@Module({
  imports: [CommonAccessModule, MemosModule, EdgesModule, AuditModule, WorkflowsModule, BlocksModule],
  providers: [CanvasService],
  controllers: [CanvasController],
})
export class CanvasModule {}
