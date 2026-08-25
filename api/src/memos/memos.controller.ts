import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { IpAccessGuard } from '../common/guards/ip-access.guard';
import { IpAccess } from '../common/decorators/ip-access.decorator';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { CurrentIp } from '../common/decorators/current-ip.decorator';
import { Actor } from '../common/actor';
import { IpDocument } from '../ips/schemas/ip.schema';
import { MemosService } from './memos.service';

/**
 * 6.3 - "memos 열람 정책 결정 필요"(설계서 8.2-1). 목업 원칙("Edit 권한자만 메모를 본다")을
 * 기본값으로 채택하되, 403 대신 View 권한자에게는 빈 배열을 반환해 FE가 별도
 * 에러 처리 없이 동작하게 한다.
 */
@UseGuards(IpAccessGuard)
@Controller('ips/:ipId/memos')
export class MemosController {
  constructor(private readonly memos: MemosService) {}

  @IpAccess('view')
  @Get()
  async list(@Param('ipId') ipId: string, @CurrentActor() me: Actor, @CurrentIp() ip: IpDocument) {
    if (!ip.owners.includes(me.knoxId)) return { data: [] };
    const memos = await this.memos.listForIp(ipId);
    return { data: memos };
  }
}
