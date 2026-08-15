import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IpAccessGuard } from '../common/guards/ip-access.guard';
import { IpAccess } from '../common/decorators/ip-access.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';
import { IpsService } from './ips.service';
import { toIpDto } from './dto/ip.dto';
import { AddOwnerDto, AddViewGrantDto } from './dto/manage-access.dto';

@UseGuards(JwtAuthGuard, IpAccessGuard)
@Controller('ips')
export class IpsController {
  constructor(private readonly ips: IpsService) {}

  @IpAccess('view')
  @Get(':ipId')
  async getOne(@Param('ipId') ipId: string, @CurrentUser() me: UserDocument) {
    const ip = await this.ips.findPopulatedOrThrow(ipId);
    return { data: toIpDto(ip, me) };
  }

  @IpAccess('edit')
  @Post(':ipId/owners')
  async addOwner(@Param('ipId') ipId: string, @Body() body: AddOwnerDto, @CurrentUser() me: UserDocument) {
    const ip = await this.ips.addOwner(ipId, body.userId, me);
    return { data: toIpDto(ip, me) };
  }

  @IpAccess('edit')
  @Delete(':ipId/owners/:userId')
  async removeOwner(
    @Param('ipId') ipId: string,
    @Param('userId') userId: string,
    @CurrentUser() me: UserDocument,
  ) {
    const ip = await this.ips.removeOwner(ipId, userId, me);
    return { data: toIpDto(ip, me) };
  }

  @IpAccess('edit')
  @Post(':ipId/view-grants')
  async addViewGrant(
    @Param('ipId') ipId: string,
    @Body() body: AddViewGrantDto,
    @CurrentUser() me: UserDocument,
  ) {
    const ip = await this.ips.addViewGrant(ipId, body.userId, body.department, me);
    return { data: toIpDto(ip, me) };
  }

  @IpAccess('edit')
  @Delete(':ipId/view-grants/:userId')
  async removeViewGrant(
    @Param('ipId') ipId: string,
    @Param('userId') userId: string,
    @CurrentUser() me: UserDocument,
  ) {
    const ip = await this.ips.removeViewGrant(ipId, userId, me);
    return { data: toIpDto(ip, me) };
  }
}
