import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HldRelease, HldReleaseSchema } from './schemas/hld-release.schema';
import { HldService } from './hld.service';
import { HldController } from './hld.controller';
import { CommonAccessModule } from '../common/common-access.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: HldRelease.name, schema: HldReleaseSchema }]),
    CommonAccessModule,
    AuditModule,
  ],
  providers: [HldService],
  controllers: [HldController],
})
export class HldModule {}
