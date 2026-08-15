import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IpAccessGuard } from '../common/guards/ip-access.guard';
import { IpAccess } from '../common/decorators/ip-access.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentIp } from '../common/decorators/current-ip.decorator';
import { UserDocument } from '../users/schemas/user.schema';
import { IpDocument } from '../ips/schemas/ip.schema';
import { HldService } from './hld.service';
import { CreateHldReleaseDto } from './dto/hld.dto';

@UseGuards(JwtAuthGuard, IpAccessGuard)
@Controller('ips/:ipId/hld-releases')
export class HldController {
  constructor(private readonly hld: HldService) {}

  @IpAccess('view')
  @Get()
  async list(@Param('ipId') ipId: string) {
    const list = await this.hld.listForIp(ipId);
    return { data: list };
  }

  @IpAccess('edit')
  @Post()
  async create(
    @Param('ipId') _ipId: string,
    @Body() dto: CreateHldReleaseDto,
    @CurrentIp() ip: IpDocument,
    @CurrentUser() me: UserDocument,
  ) {
    const hld = await this.hld.createRelease(ip, dto.note, me);
    return { data: hld };
  }
}
