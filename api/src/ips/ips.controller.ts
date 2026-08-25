import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IpAccessGuard } from '../common/guards/ip-access.guard';
import { IpAccess } from '../common/decorators/ip-access.decorator';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { Actor } from '../common/actor';
import { IpsService } from './ips.service';
import { toIpDto } from './dto/ip.dto';
import { AddOwnerDto, AddViewGrantDto } from './dto/manage-access.dto';

@UseGuards(IpAccessGuard)
@Controller('ips')
export class IpsController {
  constructor(private readonly ips: IpsService) {}

  @IpAccess('view')
  @Get(':ipId')
  async getOne(@Param('ipId') ipId: string, @CurrentActor() me: Actor) {
    const ip = await this.ips.findOrThrow(ipId);
    return { data: toIpDto(ip, me) };
  }

  @IpAccess('edit')
  @Post(':ipId/owners')
  async addOwner(@Param('ipId') ipId: string, @Body() body: AddOwnerDto, @CurrentActor() me: Actor) {
    const ip = await this.ips.addOwner(ipId, body.knoxId, body.department, me);
    return { data: toIpDto(ip, me) };
  }

  @IpAccess('edit')
  @Delete(':ipId/owners/:knoxId')
  async removeOwner(
    @Param('ipId') ipId: string,
    @Param('knoxId') knoxId: string,
    @CurrentActor() me: Actor,
  ) {
    const ip = await this.ips.removeOwner(ipId, knoxId, me);
    return { data: toIpDto(ip, me) };
  }

  @IpAccess('edit')
  @Post(':ipId/view-grants')
  async addViewGrant(
    @Param('ipId') ipId: string,
    @Body() body: AddViewGrantDto,
    @CurrentActor() me: Actor,
  ) {
    const ip = await this.ips.addViewGrant(ipId, body.knoxId, body.department, me);
    return { data: toIpDto(ip, me) };
  }

  @IpAccess('edit')
  @Delete(':ipId/view-grants/:knoxId')
  async removeViewGrant(
    @Param('ipId') ipId: string,
    @Param('knoxId') knoxId: string,
    @CurrentActor() me: Actor,
  ) {
    const ip = await this.ips.removeViewGrant(ipId, knoxId, me);
    return { data: toIpDto(ip, me) };
  }
}
