import { Module } from '@nestjs/common';
import { CommonAccessModule } from '../common/common-access.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { IpsService } from './ips.service';
import { IpsController } from './ips.controller';

@Module({
  imports: [CommonAccessModule, UsersModule, AuditModule],
  providers: [IpsService],
  controllers: [IpsController],
  exports: [IpsService],
})
export class IpsModule {}
