import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UserDocument } from '../users/schemas/user.schema';
import { ProjectsService } from './projects.service';
import { IpsService } from '../ips/ips.service';
import { toIpDto } from '../ips/dto/ip.dto';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly ips: IpsService,
  ) {}

  @Get()
  async list(@CurrentUser() me: UserDocument) {
    const projects = await this.projects.listAccessibleForUser(me._id.toString());
    return { data: projects };
  }

  @Get(':id/phases')
  async phases(@Param('id') id: string) {
    const phases = await this.projects.getPhases(id);
    return { data: phases };
  }

  /** Edit 또는 View 권한이 있는 IP만 반환 (설계서 5.1). */
  @Get(':id/ips')
  async ipsForProject(@Param('id') id: string, @CurrentUser() me: UserDocument) {
    const list = await this.ips.listAccessibleForProject(id, me._id.toString());
    const populated = await Promise.all(list.map((ip) => this.ips.findPopulatedOrThrow(ip._id.toString())));
    return { data: populated.map((ip) => toIpDto(ip, me)) };
  }
}
