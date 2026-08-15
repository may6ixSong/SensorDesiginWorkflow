import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IpAccessGuard } from '../common/guards/ip-access.guard';
import { IpAccess } from '../common/decorators/ip-access.decorator';
import { EdgesService } from './edges.service';

@UseGuards(JwtAuthGuard, IpAccessGuard)
@Controller('ips/:ipId/edges')
export class EdgesController {
  constructor(private readonly edges: EdgesService) {}

  @IpAccess('view')
  @Get()
  async list(@Param('ipId') ipId: string) {
    const edges = await this.edges.listForIp(ipId);
    return { data: edges };
  }
}
