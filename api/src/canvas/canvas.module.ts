import { Module } from '@nestjs/common';
import { CommonAccessModule } from '../common/common-access.module';
import { MemosModule } from '../memos/memos.module';
import { EdgesModule } from '../edges/edges.module';
import { AuditModule } from '../audit/audit.module';
import { CanvasService } from './canvas.service';
import { CanvasController } from './canvas.controller';

@Module({
  imports: [CommonAccessModule, MemosModule, EdgesModule, AuditModule],
  providers: [CanvasService],
  controllers: [CanvasController],
})
export class CanvasModule {}
