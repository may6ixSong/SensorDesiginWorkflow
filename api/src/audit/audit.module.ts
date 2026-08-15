import { Module } from '@nestjs/common';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema';
import { registerModels } from '../database/model-registration';
import { AuditService } from './audit.service';

@Module({
  imports: [registerModels([{ name: AuditLog.name, schema: AuditLogSchema }])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
