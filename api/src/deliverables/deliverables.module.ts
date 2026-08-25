import { Module } from '@nestjs/common';
import { CommonAccessModule } from '../common/common-access.module';
import { AuditModule } from '../audit/audit.module';
import { EdgesModule } from '../edges/edges.module';
import { StorageModule } from '../storage/storage.module';
import { DeliverablesService } from './deliverables.service';
import { DeliverablesController } from './deliverables.controller';

@Module({
  imports: [CommonAccessModule, AuditModule, EdgesModule, StorageModule],
  providers: [DeliverablesService],
  controllers: [DeliverablesController],
  exports: [DeliverablesService],
})
export class DeliverablesModule {}
