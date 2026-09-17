import { Module } from '@nestjs/common';
import { SirenCommonService } from './siren-common.service';
import { CommonRosterController } from './common-roster.controller';

@Module({
  providers: [SirenCommonService],
  controllers: [CommonRosterController],
})
export class SirenCommonModule {}
