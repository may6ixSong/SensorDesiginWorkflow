import { Module } from '@nestjs/common';
import { HldRelease, HldReleaseSchema } from './schemas/hld-release.schema';
import { registerModels } from '../database/model-registration';
import { HldService } from './hld.service';
import { HldController } from './hld.controller';
import { CommonAccessModule } from '../common/common-access.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    registerModels([{ name: HldRelease.name, schema: HldReleaseSchema }]),
    CommonAccessModule,
    AuditModule,
  ],
  providers: [HldService],
  controllers: [HldController],
})
export class HldModule {}
