import { Module } from '@nestjs/common';
import { SirenCommonService } from './siren-common.service';
import { HubEventSenderService } from './hub-event-sender.service';
import { CommonRosterController } from './common-roster.controller';

@Module({
  providers: [SirenCommonService, HubEventSenderService],
  controllers: [CommonRosterController],
  exports: [SirenCommonService, HubEventSenderService],
})
export class SirenCommonModule {}
