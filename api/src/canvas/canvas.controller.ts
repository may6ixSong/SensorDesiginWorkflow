import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IpAccessGuard } from '../common/guards/ip-access.guard';
import { IpAccess } from '../common/decorators/ip-access.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentIp } from '../common/decorators/current-ip.decorator';
import { UserDocument } from '../users/schemas/user.schema';
import { IpDocument } from '../ips/schemas/ip.schema';
import { CanvasService } from './canvas.service';
import { PutCanvasDto } from './dto/put-canvas.dto';

@UseGuards(JwtAuthGuard, IpAccessGuard)
@Controller('ips/:ipId/canvas')
export class CanvasController {
  constructor(private readonly canvas: CanvasService) {}

  @IpAccess('edit')
  @Put()
  async put(
    @Param('ipId') _ipId: string,
    @Body() dto: PutCanvasDto,
    @CurrentIp() ip: IpDocument,
    @CurrentUser() me: UserDocument,
  ) {
    const result = await this.canvas.apply(ip, dto, me);
    return { data: result };
  }
}
