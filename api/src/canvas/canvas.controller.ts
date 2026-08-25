import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { IpAccessGuard } from '../common/guards/ip-access.guard';
import { IpAccess } from '../common/decorators/ip-access.decorator';
import { CurrentActor } from '../common/decorators/current-actor.decorator';
import { CurrentIp } from '../common/decorators/current-ip.decorator';
import { Actor } from '../common/actor';
import { IpDocument } from '../ips/schemas/ip.schema';
import { CanvasService } from './canvas.service';
import { PutCanvasDto } from './dto/put-canvas.dto';

@UseGuards(IpAccessGuard)
@Controller('ips/:ipId/canvas')
export class CanvasController {
  constructor(private readonly canvas: CanvasService) {}

  @IpAccess('edit')
  @Put()
  async put(
    @Param('ipId') _ipId: string,
    @Body() dto: PutCanvasDto,
    @CurrentIp() ip: IpDocument,
    @CurrentActor() me: Actor,
  ) {
    const result = await this.canvas.apply(ip, dto, me);
    return { data: result };
  }
}
