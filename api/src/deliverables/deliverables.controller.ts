import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IpAccessGuard } from '../common/guards/ip-access.guard';
import { IpAccess } from '../common/decorators/ip-access.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentIp } from '../common/decorators/current-ip.decorator';
import { UserDocument } from '../users/schemas/user.schema';
import { IpDocument } from '../ips/schemas/ip.schema';
import { DeliverablesService } from './deliverables.service';
import { StorageService } from '../storage/storage.service';
import { toDeliverableDto, toVisibleVersions } from './dto/deliverable.dto';
import {
  AddVersionDto,
  CreateDeliverableDto,
  CreateUploadUrlDto,
  ReleaseDto,
  UpdateDeliverableDto,
  UpdateRecvDto,
  UpdateScheduleDto,
} from './dto/deliverable-crud.dto';

@UseGuards(JwtAuthGuard, IpAccessGuard)
@Controller()
export class DeliverablesController {
  constructor(
    private readonly deliverables: DeliverablesService,
    private readonly storage: StorageService,
  ) {}

  /** BE가 major/minor 가시성을 미리 필터링해서 응답 (설계서 5.1, 6.1). */
  @IpAccess('view')
  @Get('ips/:ipId/deliverables')
  async listForIp(@Param('ipId') ipId: string, @CurrentIp() ip: IpDocument, @CurrentUser() me: UserDocument) {
    const list = await this.deliverables.listForIp(ipId);
    return { data: list.map((d) => toDeliverableDto(d, ip, me)) };
  }

  @IpAccess('edit')
  @Post('ips/:ipId/deliverables')
  async create(
    @Param('ipId') ipId: string,
    @Body() dto: CreateDeliverableDto,
    @CurrentIp() ip: IpDocument,
    @CurrentUser() me: UserDocument,
  ) {
    const d = await this.deliverables.create(ip, dto, me);
    return { data: toDeliverableDto(d, ip, me) };
  }

  @IpAccess('edit')
  @Patch('deliverables/:id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDeliverableDto,
    @CurrentIp() ip: IpDocument,
    @CurrentUser() me: UserDocument,
  ) {
    const d = await this.deliverables.update(id, dto);
    return { data: toDeliverableDto(d, ip, me) };
  }

  @IpAccess('edit')
  @Delete('deliverables/:id')
  async remove(@Param('id') id: string, @CurrentUser() me: UserDocument) {
    await this.deliverables.remove(id, me);
    return { data: { id } };
  }

  @IpAccess('edit')
  @Patch('deliverables/:id/recv')
  async updateRecv(
    @Param('id') id: string,
    @Body() dto: UpdateRecvDto,
    @CurrentIp() ip: IpDocument,
    @CurrentUser() me: UserDocument,
  ) {
    const d = await this.deliverables.updateRecv(id, dto, me);
    return { data: toDeliverableDto(d, ip, me) };
  }

  @IpAccess('edit')
  @Patch('deliverables/:id/schedule')
  async updateSchedule(
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
    @CurrentIp() ip: IpDocument,
    @CurrentUser() me: UserDocument,
  ) {
    const list = await this.deliverables.updateSchedule(id, dto.phaseKeys, me);
    return { data: list.map((d) => toDeliverableDto(d, ip, me)) };
  }

  @IpAccess('view')
  @Get('deliverables/:id/versions')
  async versions(@Param('id') id: string, @CurrentIp() ip: IpDocument, @CurrentUser() me: UserDocument) {
    const d = await this.deliverables.findOrThrow(id);
    return { data: toVisibleVersions(d, ip, me) };
  }

  @IpAccess('edit')
  @Post('deliverables/:id/upload-url')
  async uploadUrl(@Param('id') id: string, @Body() dto: CreateUploadUrlDto, @CurrentIp() ip: IpDocument) {
    const d = await this.deliverables.findOrThrow(id);
    const nextMinor = (d.versions[0]?.minor ?? 0) + 1;
    const storageKey = this.storage.buildStorageKey(
      ip._id.toString(),
      d._id.toString(),
      `${d.versions[0]?.major ?? 0}.${nextMinor}`,
      dto.fileName,
    );
    const result = await this.storage.createPresignedUpload(storageKey, dto.contentType);
    return { data: result };
  }

  @IpAccess('edit')
  @Post('deliverables/:id/versions')
  async addVersion(
    @Param('id') id: string,
    @Body() dto: AddVersionDto,
    @CurrentIp() ip: IpDocument,
    @CurrentUser() me: UserDocument,
  ) {
    const d = await this.deliverables.addVersion(id, dto, me);
    return { data: toDeliverableDto(d, ip, me) };
  }

  @IpAccess('edit')
  @Post('deliverables/:id/release')
  async release(
    @Param('id') id: string,
    @Body() dto: ReleaseDto,
    @CurrentIp() ip: IpDocument,
    @CurrentUser() me: UserDocument,
  ) {
    const d = await this.deliverables.release(id, dto, me);
    return { data: toDeliverableDto(d, ip, me) };
  }
}
